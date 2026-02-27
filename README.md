# Photo App HTTPS Server

Simple Express API running on HTTPS for local dev.

## Files

- `server.js` - API routes + HTTPS server
- `package.json` - scripts and deps
- `certs/` - local SSL cert and key

## Requirements

- Node.js 18+
- npm
- OpenSSL

## Run it

1. Install deps:

```bash
npm install
```

2. Make cert folder:

```bash
mkdir -p certs
```

3. Generate local certs:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

4. Start:

```bash
npm start
```

5. Test:

```bash
curl -k https://localhost:3000/health
curl -k https://localhost:3000/posts
```

Open `https://localhost:3000` in browser after that.

## Notes

- Self-signed cert is for local only, browser warning is expected.
- If cert files are missing, server exits and tells you paths.
- Helmet is on.
- Cache headers are set per route in `server.js`.

## Reflections / Lessons Learned

I picked a photo sharing API because it made the Phase 1 security work easier to reason about. In this kind of app, some data is clearly public (posts, tags, public profile views) and some data is clearly not (user-specific feed behavior, admin-ish endpoints, and write actions). That split made caching decisions way less confusing. I could look at each route and decide if short-term caching is fine or if it absolutely should not be stored.

For SSL, OpenSSL self-signed certs were the practical choice for local development. I didn’t need domain setup, DNS, or any external config. I just needed local HTTPS working so I could test the real behavior. The downside is the browser warning, which is expected but still annoying the first time. Safari was especially confusing because it looks like everything is blocked even when the server is up. The biggest real issue was cert paths and filenames. The app expects `certs/localhost-key.pem` and `certs/localhost-cert.pem`, and if those are missing, startup fails immediately. I hit that more than once while iterating. In production, this would be a bad experience for users, so I’d use a trusted certificate provider like Let’s Encrypt.

Helmet did exactly what I needed here: a good base without writing a lot of custom header code. I verified behavior with curl and checked that key headers were present: `Content-Security-Policy`, `X-Frame-Options` (plus `frame-ancestors` behavior via CSP), `Referrer-Policy`, `Strict-Transport-Security`, and `X-Content-Type-Options`. In practical terms, CSP helps block injected scripts and unsafe resource loading, frame protections reduce clickjacking risk, referrer policy limits how much URL info leaks to other sites, HSTS pushes browsers to stay on HTTPS, and nosniff reduces weird content-type sniffing problems. This doesn’t make the app magically “secure,” but it closes common holes early.

The most frustrating debugging issues were simple but real. I saw the server exit on missing cert files until I fixed folder/file names. I got tripped up by Safari’s self-signed warning and had to verify with `curl -k` to confirm the API was actually running. I also hit `Cannot GET /` when testing in the browser and realized that having only API routes is fine for curl, but the assignment says to navigate to the root URL, so the root route (hahaha) needed to exist and show something useful. Another mistake was testing POST routes with GET checks; write routes need `POST` requests (`curl -X POST ...`) or they won’t run. I also lost time forgetting to restart the server after edits and then wondering why changes “didn’t work.”

Caching was the biggest trade-off decision. `GET /posts` uses `public, max-age=300, stale-while-revalidate=60`, and `GET /posts/:id` uses `public, max-age=300`. That gives better response speed for public read endpoints where a little downtime is acceptable. Write routes are `no-store` because caching state-changing responses can cause wrong behavior and privacy problems. User-specific or admin-style routes also stay `no-store` for the same reason. So the final approach is simple: cache what is safely public and read-only, never cache what is sensitive or mutating state.
