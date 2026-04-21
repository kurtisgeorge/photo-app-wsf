# Photo App WSF - Phase 4 (Threat Modelling, Testing, and Fixes)

Express HTTPS app for a photo-sharing project. Phase 4 focuses on security: threat modelling, vulnerability testing, fixing what was found, and documenting the whole thing honestly.

All previous work (HTTPS, JWT auth in secure cookies, express-session, CSRF via csurf, bcrypt password hashing, AES-256-GCM for email/bio at rest, express-validator, login rate limiting, Helmet, GitHub Actions audit workflow) is still in place and is built on, not replaced.

## Requirements

- Node.js 18+
- npm
- OpenSSL for the local HTTPS certificate
- Google OAuth credentials only if you want to use the Google sign-in flow

## Clone and Install

```bash
git clone <your-repo-url>
cd photo-app-wsf
npm install
```

## Environment Setup

Copy the example file and fill in local values:

```bash
cp .env.example .env
```

```ini
JWT_SECRET=replace_with_a_strong_jwt_secret
SESSION_SECRET=replace_with_a_different_strong_session_secret
ENCRYPTION_KEY=replace_with_a_64_character_hex_key
GOOGLE_CLIENT_ID=replace_with_google_oauth_client_id
GOOGLE_CLIENT_SECRET=replace_with_google_oauth_client_secret
```

Generate secrets:

```bash
# JWT / SESSION secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# ENCRYPTION_KEY (must be 64 hex chars / 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`JWT_SECRET` and `SESSION_SECRET` must be different — one signs JWTs, the other signs session cookies. Reusing the same value for both was one of the issues fixed in this phase.

## HTTPS Certificate Setup

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

## Start the Server

```bash
npm start
```

Then visit `https://localhost:3000` and accept the self-signed cert warning.

---

## Threat Model

The full threat model lives in [`docs/threat-model.md`](docs/threat-model.md) and includes:

- a Mermaid architecture / data-flow diagram
- trust boundaries (browser ↔ server, app ↔ Google OAuth, app ↔ in-memory store)
- an asset inventory (credential hashes, JWT secret, session secret, AES key, PII, roles, posts, TLS key)
- attack vectors (auth bypass, XSS, CSRF, brute force, enumeration, caching, secret leakage, dependency CVEs, open-redirect via imageUrl, etc.)
- a STRIDE threat table with Likelihood / Impact / Risk for each threat and the mitigation applied
- residual risks

Short version of what it covers: the app is a single Node.js process behind HTTPS with in-memory storage, JWT-in-cookie auth plus optional Google OAuth, server-rendered views with explicit HTML escaping, and AES-256-GCM encryption of PII at rest. The trust boundary I cared about most is the browser-to-server edge, because every user input has to be validated, authenticated, and authorized there.

## Security Testing

Detailed testing evidence lives in [`docs/security-testing-notes.md`](docs/security-testing-notes.md).

### Testing Tools

| Tool | What it did |
|---|---|
| `npm audit` | Automated dependency vulnerability scan |
| `curl` | Manual attack simulation against every relevant route (auth bypass, XSS, CSRF, validation, rate limits, cache-control, cookie flags) |
| `node --check` | Syntax smoke-check after each edit |
| Browser DevTools | Quick visual check of cookie flags and response headers |

I did **not** run a full OWASP ZAP active scan. I didn't want to pretend I used a scanner I couldn't actually reproduce in this environment, so instead I walked through the categories ZAP would flag (missing auth, missing security headers, CSRF, session fixation, XSS, insecure cookies, outdated components) and tested each one manually against the running server. A real ZAP run would be a reasonable next step in a longer environment.

### Vulnerabilities Identified

These are the things I actually found and addressed, in severity order.

| # | Vulnerability | Where | Severity |
|---|---|---|---|
| V1 | Unauthenticated access to `GET /admin/review-queue` | server.js | High |
| V2 | Unauthenticated `POST /posts`, with client-controlled `author` | server.js | High |
| V3 | Unauthenticated `POST /posts/:id/like` | server.js | Medium |
| V4 | Session cookie missing `httpOnly` / `sameSite` / `maxAge` | session config | Medium |
| V5 | `express-session` reused `JWT_SECRET` as its signing secret | session config | Medium |
| V6 | Full user object (incl. `hashedPassword`) stored in `req.session.user` | login + OAuth callback | Medium |
| V7 | No rate limit on `POST /auth/register` (mass registration / DoS) | server.js | Medium |
| V8 | No rate limit on `POST /auth/forgot-password` (abuse / enumeration) | server.js | Medium |
| V9 | Registration validation was ad-hoc and weaker than profile update (no password character class check, different style) | server.js | Medium |
| V10 | `Cache-Control: no-store` was only set for authenticated HTML pages, not for protected JSON API responses | server.js | Low–Medium |
| V11 | `POST /posts` accepted arbitrary strings for `caption`, `imageUrl`, and `tags` (stored XSS / javascript: URL surface) | server.js | Medium |
| V12 | `csurf` transitive `cookie` CVE (GHSA-pxg6-pf52-xh8x) | dependencies | Low |

The audit prompt mentioned a real `ENCRYPTION_KEY` in `.env.example`. I rescanned and the committed `.env.example` already contained a placeholder (`your_64_char_hex_key_here`), so there was no real key to remove. I added `SESSION_SECRET` there and kept placeholders everywhere. The real `.env` is git-ignored.

### Vulnerability Fixes

| # | Fix applied |
|---|---|
| V1 | Protected with `authenticateJWTapi` + `authorizeRoles('Admin')`. |
| V2 | Added `authenticateJWTapi`. The `author` field is now always taken from `req.user.username` (JWT), never from the body. Added `postValidation` (see V11). |
| V3 | Added `authenticateJWTapi`. Also validates `:id` is a positive integer. |
| V4 | Session cookie is now `name: 'sid', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 1h`. |
| V5 | Added `SESSION_SECRET` env variable. The app prefers it over `JWT_SECRET` and fails fast if neither is set. `.env.example` updated. |
| V6 | Session now stores only `{ id, username, role }`. Dashboard still works because it re-fetches the user by id. |
| V7 | Added `registerLimiter` (5 / hour per IP). |
| V8 | Added `forgotPasswordLimiter` (5 / hour per IP). Response stays generic regardless of whether the email exists, so it doesn't leak account existence. |
| V9 | Registration now uses `express-validator`, same style as profile update. Username regex matches profile rules; password requires min 8 chars, at least one letter, at least one number; email is normalized and length-capped. |
| V10 | `authenticateJWTapi` now sets `Cache-Control: no-store` on every response that passes through it, so protected JSON is never cached by a shared proxy or the browser. |
| V11 | `postValidation` enforces: caption 1–500 chars and no `<` / `>`, `imageUrl` must match `http(s)://...` or an absolute `/path`, max 20 tags, each tag alnum/._- only. This blocks things like `imageUrl: javascript:alert(1)`. |
| V12 | Documented honestly. Not auto-"fixed" because the only npm-suggested fix is a semver-major downgrade of `csurf` that would remove CSRF protection. Deprecation noted below. |

### Validation of Fixes

Every fix was re-tested on the running app. Full transcripts are in [`docs/security-testing-notes.md`](docs/security-testing-notes.md). Quick summary:

- `curl https://localhost:3000/admin/review-queue` → `401`. Logged in as a `User` role → `403`. Admin gate works.
- `POST /posts` without a JWT → `401`. With a valid JWT and XSS caption → `400 caption must not contain < or >`. With `imageUrl: javascript:alert(1)` → `400 imageUrl must be a valid http(s) or absolute path url`. Valid body → `201` with `author` taken from the JWT.
- `POST /posts/:id/like` without a JWT → `401`. `:id = abc` → `400 Invalid post id`.
- Fired 8 register POSTs from the same IP → first succeeded, rest `429`.
- Fired 7 forgot-password POSTs (with CSRF) → first 5 `200`, rest `429`.
- Session response carries `Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax`. JWT cookie carries `HttpOnly; Secure; SameSite=Strict`.
- `curl -D -` on `/profile`, `/feed/me`, `/admin/review-queue`, and `POST /posts/:id/like` all return `Cache-Control: no-store`.
- `POST /dashboard/update` with `bio=<script>alert(1)</script>` → redirects to dashboard with flash error `Bio must not contain HTML tags.` Nothing stored.
- `npm audit`: 2 low-severity findings remaining, both from `csurf`'s transitive `cookie` version. Documented, not suppressed.

### Things that don't apply to this app

- **SQL injection**: there is no database. Storage is plain JavaScript arrays. Payloads like `admin' OR 1=1 --` tested against `username` and `email` fields were rejected by the character-class validators before anything tried to look them up. No SQL surface exists.
- **File upload**: there is no upload endpoint. Posts accept a string `imageUrl`, which is now validated.
- **Formal compliance certification**: not claimed. This is a student project.

---

## Ethical Responsibilities of Security Professionals

All testing here was done against my own local development copy of this course project. A few principles I tried to stick to:

- **Authorized scope only.** I did not point scanners, brute-force scripts, or anything else at third-party systems. Testing was limited to `https://localhost:3000` on my own machine.
- **Minimum necessary data.** The app stores dummy users and dummy posts. Even though the data is fake, I treated email and bio as if they were real — that's why they stay encrypted at rest with AES-256-GCM and decrypted only for the authenticated user's own dashboard view.
- **Don't leak what you find.** I didn't post payloads, secret material, or user-identifiable data anywhere outside this repo. Real keys never go into git; only the placeholders in `.env.example` do.
- **Responsible disclosure mindset.** If I found something like this in a real product and I wasn't the owner, the right move would be to report it privately to the maintainer, give them time to fix it, and not publish a working exploit until users are protected. Even inside this project, my fixes came with tests so the next person reading this doesn't need to trust me — they can re-run the checks.
- **No fabricated results.** If a tool wasn't actually run (OWASP ZAP), I said so in the testing notes. If a finding didn't apply (SQL injection, file upload), I said that too.

## Legal Implications of Security Testing

A few things I paid attention to, framed carefully for a Canadian context without pretending to be a lawyer:

- **Only test systems you're authorized to test.** Running scanners or credential-stuffing scripts against somebody else's system without written permission is where legitimate security work ends and unauthorized-computer-access starts. In Canada that's in the territory of Criminal Code §342.1 (unauthorized use of computer) and §430(1.1) (mischief in relation to computer data). For this project, authorization is obvious: it's my code, my machine, my course submission.
- **Privacy legislation is relevant even to a student app.** In a real deployment, storing users' emails and profile text would fall under PIPEDA federally and something like Alberta's PIPA provincially. That's why PII is encrypted at rest here, why the register / forgot-password endpoints don't leak account existence, and why error responses are generic. None of this makes the app "PIPEDA compliant" — it just shows the thought process.
- **Retention.** Since there's no database, everything disappears on restart. In a real app, retention / deletion would need an actual policy.
- **No compliance certification is claimed.** I'm not stamping this as HIPAA / SOC2 / PCI anything. Saying so would be misleading in a student project.
- **Disclosure and third-party code.** The project relies on Open Source packages. One of them (`csurf`) is deprecated, and `npm audit` reports a low-severity finding in its transitive `cookie` dependency. That is disclosed honestly in the README and threat model instead of hidden.

## Lessons Learned

**What ended up being the biggest findings?**

Unauthenticated admin access (`GET /admin/review-queue`) and unauthenticated `POST /posts` / `POST /posts/:id/like` were the scariest ones, because the fix is small but the blast radius before the fix was big — anyone on the network could write posts under any username and bump like counts forever. Those were also the kind of bugs that are invisible from the UI because you only notice them if you hit the route directly with curl. Good reminder that "the UI doesn't expose it" is not a security control.

**What was trickier than expected?**

CSRF behaviour during testing was surprisingly annoying. `csurf` in cookie mode uses a cookie-bound secret, so if my curl jar didn't refresh the cookie between requests I'd get a 403 on something that should have worked. It wasn't a real bug — it was me — but it did remind me that CSRF tokens and session cookies have to travel together, and that makes manual testing with curl fiddly. It also made me appreciate that users get a correct experience only because the form re-issues a fresh token on every render.

Another trickier one was the session config. Changing the session secret (`JWT_SECRET` → dedicated `SESSION_SECRET`) was easy in code, but it's the kind of thing that silently invalidates every existing session cookie the next time someone restarts the server. For a real app I'd want to handle the transition a bit more gracefully.

**Did any fix have side effects?**

Yeah — making `POST /posts` take `author` from the JWT instead of the body is strictly better for security, but it also means the API surface changed. Anything that previously posted with a manual `author` field now has that field ignored. In this project that's fine because nothing real was calling it. In a real deployment, this would need a version bump or a deprecation window.

Adding rate limiters also affected manual testing — I hit my own register limiter (5/hour) part way through validation testing, and had to restart the process to reset the in-memory counter. That's expected behaviour, but it made me realize a real app needs a smarter limiter (per-account backoff, not just per-IP) and probably needs to be externalized.

**What did this show about defense in depth?**

A lot, actually. Every XSS attempt I tried in this round got stopped at two or three places: input validation rejected it, the views escape output anyway, and Helmet's CSP would block an inline script even if the rendered page contained one. That's the whole point — no single control should be the only thing keeping users safe. Same with CSRF: `csurf` handles it, but `sameSite` on both cookies also helps, and the JSON routes require a JWT on top of all that. When I temporarily broke CSRF during testing, the route was still protected by auth. That's the layering doing its job.

**What could still be improved?**

- Replace `csurf` (deprecated) with something like `@dr.pogodin/csurf` or a modern double-submit implementation. Deferred because it's a swap that deserves its own careful PR.
- Per-account login throttling on top of per-IP.
- Move session + rate-limit state out of in-process memory so they survive restarts.
- Add a proper ZAP / Burp run in an environment that supports it, and wire security-focused unit tests into the GitHub Actions workflow (not just `npm audit`).
- Persistent store with auditable logs — right now there's no trail of who did what.

---

## Troubleshooting

- If startup shows missing certificate errors, run the OpenSSL command above to create `certs/localhost-*.pem`.
- If `ENCRYPTION_KEY` is missing or wrong length, update `.env` with a 64-character hex string.
- If the app exits immediately with a message about `SESSION_SECRET`, add both `JWT_SECRET` and `SESSION_SECRET` to your `.env`.
- If the browser blocks the page, accept the local self-signed certificate warning for `https://localhost:3000`.
- If CSRF errors appear after sitting idle, reload the page so a fresh token is issued.
- If you hit `429 Too Many Requests` while testing register / login / forgot-password, wait out the window or restart the server to reset the in-memory counters.
- If port 3000 is already in use, stop the other process or change the port in the server configuration.
