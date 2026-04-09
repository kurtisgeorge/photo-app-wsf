# Photo App WSF - Phase 3 (Dashboard & Data Security)

Express HTTPS app for a photo-sharing project with a secure user dashboard, profile updates, input validation, output encoding, encrypted profile data, dependency auditing, and automated security checks.

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

1. Copy the example file:

```bash
cp .env.example .env
```

2. Update `.env` with your own local values:

```ini
JWT_SECRET=replace_with_a_strong_jwt_secret
GOOGLE_CLIENT_ID=replace_with_google_oauth_client_id
GOOGLE_CLIENT_SECRET=replace_with_google_oauth_client_secret
ENCRYPTION_KEY=replace_with_a_64_character_hex_key
```

`ENCRYPTION_KEY` must be a 64-character hex string (32 bytes). You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You can generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Google OAuth values are optional if you are only using local login.

## HTTPS Certificate Setup

Generate the local certificate files if they do not already exist:

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

After startup, visit:

`https://localhost:3000`

Your browser will warn about the self-signed certificate. Accept it for local development.

## Dashboard and Profile Flow

After login, users are taken to the authenticated home page. From there, they can open their profile dashboard.

The dashboard includes:
- a welcome message with the user’s name
- the user’s profile details
- a profile update form for name, email, and bio
- a logout button

Dashboard access is protected, and only the logged-in user’s own data is displayed.

## Input Validation

Profile updates are validated on the server with `express-validator`.

Validation rules:
- **Name:** 3 to 50 characters, letters and spaces only
- **Email:** must be a valid email address
- **Bio:** maximum 500 characters, no HTML tags, no special characters

Sanitization is also applied before storing the data. This helps prevent malicious input from being saved in the first place.

Improper input validation can lead to stored XSS, malformed input, and injection-style attacks. In this project, validation and sanitization reduce that risk before the data reaches storage or rendering.

## Output Encoding

User-controlled values are escaped before being inserted into the HTML output. This prevents the browser from interpreting profile data as executable markup or script.

For example, if a user tried to save `<script>alert(1)</script>`, it would be rendered as plain text instead of executing in the browser.

This is important because output encoding is the last line of defense against XSS if malicious input ever gets through validation.

## Encryption

Sensitive profile fields are encrypted at rest before storage:
- **Email**
- **Bio**

The app uses AES-256-GCM through Node’s built-in `crypto` module. Encrypted values are decrypted only when needed for the authenticated user’s dashboard view.

Passwords are not encrypted. They are hashed with bcrypt, which is the correct approach for passwords.

Data is also protected in transit because the app runs over HTTPS locally.

One of the main challenges with encryption was keeping the IV, auth tag, and ciphertext together in a format that was easy to store and read back safely. I solved that by storing the encrypted value in a single structured string and decrypting it only at render time.

## Third-Party Dependency Management

I ran `npm audit` to check for dependency vulnerabilities and fixed what was reasonable without breaking the project.

I also added a GitHub Actions workflow to automate security checks on push and pull request. The workflow installs dependencies, runs an audit, and checks for outdated packages.

Using outdated libraries is risky because known vulnerabilities stay in your app until they are patched. Automation helps catch those problems earlier, but it still needs human review because not every suggested update is safe to apply blindly.

## Testing and Debugging

I tested the profile form with malicious input attempts to verify that validation, sanitization, and output encoding were working as expected.

Examples included:
- script tag payloads in the name and bio fields
- HTML-based XSS attempts
- malformed email values
- injection-style payloads entered through text fields

The main goal was to confirm that:
- invalid input is rejected
- dangerous content is not stored
- rendered output does not execute as code

The most challenging part was making sure the protections worked together properly instead of relying on just one layer. Additional tools like OWASP ZAP, Burp Suite, or more automated tests would improve the process further.

## AI Tools Used

AI tools were used for:
- dashboard markup and styling
- form HTML structure
- implementation support during development


## Lessons Learned

**What vulnerabilities can arise from improper input validation?**  
If input is not validated properly, people can slip in scripts, weird payloads, or just bad data that should never be stored in the first place. In this project, the obvious example was the bio field. If I let HTML through there, someone could store a script and turn it into a stored XSS issue.

**How does output encoding prevent XSS attacks?**  
Output encoding makes dangerous characters harmless before they get rendered in the browser. So instead of the browser reading `<script>` as actual code, it just shows it as text. In my app that mattered a lot because I was rendering string templates, so I had to be intentional about escaping user data anywhere it showed up.

**What challenges came up with encryption, and how were they resolved?**  
The main annoying part was making sure the encrypted data was stored in a format that still gave me everything I needed to decrypt it later. I ended up storing the IV, auth tag, and ciphertext together as one colon-separated value, which kept it simple. I also made sure the encryption key stayed in environment variables instead of hardcoding it anywhere.

**Why is it risky to use outdated third-party libraries?**  
Because if a package already has a known vulnerability, you are basically leaving that door open until you deal with it. In this project I ran into that with dependency audit results, and it was a good reminder that even small packages can create real security problems if they are ignored.

**How does automation help with dependency management, and what risks does automation introduce?**  
Automation is useful because it catches problems earlier and saves you from having to remember every check manually. But it can also be a little dangerous if you blindly trust every suggested fix, because some updates can break working code or change behavior in ways you did not expect. So it helps with detection, but you still need judgment.

**Which vulnerabilities were most challenging to address?**  
Honestly, balancing everything together was the hardest part. Validation, encoding, encryption, sessions, and dependency issues all connect to each other, so it was less about one single bug and more about making sure the whole flow was actually secure and still worked properly.

**What additional testing tools or strategies could improve the process?**  
Manual testing helped, but better automated testing would make this a lot stronger. Tools like OWASP ZAP or Burp Suite would be useful, and even just adding more repeatable tests for validation and encryption would make it easier to catch mistakes faster.


## Troubleshooting

- If startup shows missing certificate errors, generate the local certificate files in the `certs/` folder with the OpenSSL command above.
- If `ENCRYPTION_KEY` is missing or invalid, update `.env` with a valid 64-character hex string.
- If the browser blocks the page, accept the local self-signed certificate warning for `https://localhost:3000`.
- If CSRF errors appear after sitting idle, reload the page and try again.
- If port 3000 is already in use, stop the other process or change the port in the server configuration.

