# Photo App WSF - Phase 2 (Auth & Security)

Express API for a photo-sharing app with authentication, RBAC, and secure session handling.

## Requirements

- Node.js 18+
- npm
- OpenSSL (for local HTTPS)
- Google Cloud Console credentials (for OAuth)

## Run it

1. Install dependencies:

```bash
npm install
```

2. Make cert folder and generate local certs (if you havent already):

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

3. Set up environment variables:
Create a `.env` file in the root folder and add your secrets:

```ini
JWT_SECRET=your_super_secret_jwt_string
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

4. Start:

```bash
npm start
```

## Authentication Mechanisms

- **Local Auth:** Uses `bcryptjs` to hash passwords on registration. When logging in, it compares the entered password against the stored hash.
- **SSO:** Google OAuth 2.0 lets users sign in with Google instead of making a new password.
- **Sessions (JWT):** After a successful login (either local or Google), the server generates a JSON Web Token (JWT) containing the user's ID and role. This gets sent to the client inside a secure, `HttpOnly` cookie.

## Role-Based Access Control (RBAC)

Access is controlled with middleware that checks the role payload inside the user's JWT.

- **Roles:** `User` (standard access) and `Admin` (elevated access).
- **`/profile`:** Protected route. Any authenticated user can hit this to see their own info.
- **`/admin`:** Highly protected route. Only accessible if your JWT says you are an Admin. Normal users get bounced with a 403 Forbidden.
- **`/dashboard`:** Shared route. Shows different data depending on whether the JWT belongs to a User or an Admin.

## Reflections / Lessons Learned

I used both local auth and Google OAuth. I wanted local login there as a backup since it is simple and easy to control, but Google sign-in makes the app way less annoying to use. That choice was mostly based on what I usually expect as a user too. If a site gives me a quick sign-in option, I will probably use that instead of making another password.

For access control, I kept it simple with just `User` and `Admin` roles. That felt like enough for this app without making the whole thing harder than it needed to be. I stored the role with the user and passed it into the JWT so the middleware could check it on the protected routes I set up. The main challenge was making sure the checks were strict enough without making normal users hit weird permission issues all the time.

I stored the JWT in an `HttpOnly` cookie because I didn't want it sitting in `localStorage`. That felt safer for XSS reasons, even if the setup was a bit more annoying. The main trade-off was dealing with cookie settings and making sure the token still worked cleanly during local testing. It took a bit of messing around to get the middleware and cookie handling working the way I wanted.

The biggest security risks I focused on were CSRF, brute force login attempts, and session fixation. I added rate limiting on the login route, used CSRF protection, and regenerated the session on login so old session data would not carry over. The trickiest part was getting the cookie settings like `Secure` and `SameSite` to behave on localhost without breaking everything.

For testing, I mostly did manual checks on the main auth flow. I tested login, logout, token expiry, and tried hitting `/admin` with a regular user to make sure it got blocked with a 403. I also checked the browser dev tools a lot to make sure the cookies had the right flags set. I fixed cookie and token issues first because if those are wrong, the whole auth system feels broken right away.
