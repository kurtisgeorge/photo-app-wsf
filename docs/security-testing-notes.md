# Security Testing Notes

This document captures the actual testing that was done against the running app during Phase 4, what was found, how it was fixed, and how the fix was validated afterward. Tests were performed only against the local development server on `https://localhost:3000`.

## Environment

- macOS, Node.js 18+, single local Express HTTPS process
- Self-signed TLS cert (`certs/localhost-*.pem`)
- No third-party systems touched

## Tools used

| Tool | Role | Honest note |
|---|---|---|
| `npm audit` | Automated dependency vulnerability scan | Real output captured below |
| `curl` | Manual HTTP attack simulation against each route | Primary testing tool for this project |
| Node syntax check (`node --check`) | Smoke-check server.js for syntax regressions | |
| Browser DevTools (manual) | Cookie flag inspection, CSP / Helmet header review | |

**OWASP ZAP was not run.** I did not want to drive a full active scan against a self-signed local HTTPS server in this environment and I would rather not report scanner output that I cannot actually reproduce. Instead, I mapped ZAP's typical checks (XSS, auth bypass, missing security headers, CSRF, rate limiting, insecure cookies, outdated components) to manual curl tests listed below. ZAP would be a sensible next step in a longer-running environment.

## npm audit result

Command: `npm audit`

Result: **2 low-severity findings**, both transitive through `csurf`'s pinned old `cookie` version (GHSA-pxg6-pf52-xh8x). The only "fix" npm proposes is a semver-major downgrade to `csurf@1.2.2` that would remove CSRF protection entirely, so I did not blindly apply it.

Mitigation taken:
- documented `csurf` as deprecated in the README
- kept CSRF protection in place because breakage > low-severity cookie parsing edge case
- left the finding visible in `npm audit` rather than suppressing it

## Manual attack simulation matrix

Every test below was actually executed. Before-fix state is taken from the pre-Phase 4 code.

### 1. Unauthenticated access to admin route
- Route: `GET /admin/review-queue`
- Before: returned `200 OK` with JSON body to any caller (no auth middleware).
- Attack: `curl -sk https://localhost:3000/admin/review-queue`
- After fix: `HTTP 401 {"error":"Access denied. No token provided."}`
- Fix: wrapped with `authenticateJWTapi` + `authorizeRoles('Admin')`.
- Validation: re-tested while logged in as a `User` role → `HTTP 403 Forbidden`. Role gate is working.

### 2. Unauthenticated post creation
- Route: `POST /posts`
- Before: no auth; any caller could set the `author` field to any value.
- Attack (no auth, valid CSRF):
  ```
  curl -X POST /posts -H 'X-CSRF-Token: ...' \
    -d '{"caption":"pwned","imageUrl":"/a.png"}'
  ```
- After fix: `HTTP 401 {"error":"Access denied. No token provided."}`
- Fix: added `authenticateJWTapi` and took `author` from the decoded JWT instead of the body. Added `postValidation` (caption no `<>`, imageUrl must be http(s) or `/path`, tags array capped).
- Validation (authenticated):
  - XSS caption `<img src=x onerror=alert(1)>` → `HTTP 400 caption must not contain < or >`
  - `imageUrl: javascript:alert(1)` → `HTTP 400 imageUrl must be a valid http(s) or absolute path url`
  - valid body → `HTTP 201`, post created with `author` = logged-in user.

### 3. Unauthenticated like
- Route: `POST /posts/:id/like`
- Before: no auth.
- After fix: authed → `HTTP 200 {"id":1,"likes":19}`. Unauthed → `HTTP 401`.
- Validation: `POST /posts/abc/like` → `HTTP 400 {"error":"Invalid post id"}`.

### 4. Registration input validation
- Route: `POST /auth/register`
- Tests:
  - `password=justletters` → `Password must contain at least one number.`
  - `password=abc1` → `Password must be at least 8 characters.`
  - `username=bad user!!` → `Username must contain only letters, numbers, ., _, -`
  - valid → `Account created! You can now log in.`
- Fix: moved validation to `express-validator`, aligned with profile update (same username rules), added letter + number requirement for password, capped length, normalized email.

### 5. Rate limiting (register)
- Before: no limiter.
- After: `registerLimiter` 5 / hour.
- Test: fired 8 sequential registrations from the same IP.
  - 1 succeeded, 2–8 returned `HTTP 429`.

### 6. Rate limiting (forgot-password)
- Before: no limiter.
- After: `forgotPasswordLimiter` 5 / hour.
- Test: fired 7 requests with valid CSRF.
  - 1–5 returned `HTTP 200`, 6–7 returned `HTTP 429`.
- Response is generic in all cases, so email enumeration is still blocked.

### 7. Rate limiting (login)
- Unchanged behaviour, re-verified.
- Test: 12 wrong logins from the same IP.
  - First 9 → `200` (re-rendered login page with error), 10+ → `429`.

### 8. XSS in bio
- Route: `POST /dashboard/update`
- Payload: `bio=<script>alert(1)</script>`
- Result: `HTTP 302` back to `/dashboard` with flash `Please fix the errors below.` and field error `Bio must not contain HTML tags.` No data stored.
- Defense in depth: even if validation was bypassed, `views/dashboard.js` escapes user input via `escapeHtml`.

### 9. CSRF
- `POST /dashboard/update` without `_csrf` cookie/token: `HTTP 403 Invalid or missing CSRF token.`
- `POST /auth/forgot-password` without CSRF: same result.
- `csurf` cookie mode is enforced app-wide. Note: the `csurf` package is deprecated but still functional, and the `npm audit` finding above is low-severity; replacing it is out of scope for this phase.

### 10. Cache-Control on protected responses
- Before: `Cache-Control: no-store` set only in `authenticateJWT` (HTML pages).
- Fix: also set in `authenticateJWTapi` so every protected JSON response is non-cacheable.
- Validation:
  - `curl -D - https://localhost:3000/profile` → `Cache-Control: no-store`
  - `curl -D - https://localhost:3000/admin/review-queue` → `Cache-Control: no-store`
  - `curl -D - https://localhost:3000/feed/me` → `Cache-Control: no-store`
  - `POST /posts/:id/like` response also carries `Cache-Control: no-store`.

### 11. Session cookie flags
- Before: `cookie: { secure: true }` only — no `httpOnly`, no `sameSite`, no name, no maxAge.
- Fix: `name: 'sid'`, `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `maxAge: 1h`.
- Validation (login response):
  ```
  Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
  Set-Cookie: sid=...;   HttpOnly; Secure; SameSite=Lax;    Max-Age=3600
  ```

### 12. Shared secret for JWT and session
- Before: `session({ secret: process.env.JWT_SECRET })` reused the same key for JWT signing and session cookie signing.
- Fix: added `SESSION_SECRET` env var. `server.js` uses `process.env.SESSION_SECRET || process.env.JWT_SECRET` with a startup failure if neither is set. `.env.example` updated.
- Validation: server still starts. `SESSION_SECRET` documented in both `.env.example` and README.

### 13. Session storing full user record
- Before: login path stored the entire user object (including `hashedPassword`) on `req.session.user`.
- Fix: only `{ id, username, role }` is stored. Applies to both local login and OAuth callback.
- Validation: code review + successful login flow (dashboard still renders the user’s data because it is looked up from `users` by JWT-decoded id, not from session).

## SQL / file upload tests — not applicable

- **SQL injection**: the project has no database layer. Storage is in-memory JavaScript arrays. I tested payloads like `admin' OR 1=1 --` against `username` / `email` fields anyway and they were handled as plain strings (validation rejected them as invalid characters before any lookup). No injection surface exists.
- **File upload**: there is no file upload endpoint. Posts only accept a string `imageUrl`. This `imageUrl` is now validated to be `http(s)://...` or an absolute path.

## Security headers

Verified via `curl -D -`:

- `Content-Security-Policy: default-src 'self'; ...`
- `Strict-Transport-Security: max-age=15552000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`

All provided by `helmet()` defaults. Left as-is.

## Residual / known limitations

- `csurf` is deprecated. Still functional; replacement deferred.
- In-memory store; data lost on restart. Not a security bug, but relevant for any real-world use.
- Login uses a per-IP limiter, not per-account. Realistic improvement would be a lockout on repeated failures for a specific username.
- No audit logging.
