const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderRegisterPage = ({ csrfToken, error, success }) => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Register | Photo App</title>
    <link rel="stylesheet" href="/static/styles/login.css" />
  </head>
  <body>
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-header">
          <p class="eyebrow">Photo App</p>
          <h1>Create account</h1>
        </div>

        ${error ? `<div class="flash flash-error" role="alert">${escapeHtml(error)}</div>` : ''}
        ${success ? `<div class="flash flash-success" role="status">${escapeHtml(success)}</div>` : ''}

        <form class="auth-form" action="/auth/register" method="post" novalidate>
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

          <div class="field">
            <label for="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autocomplete="username"
              required
            />
            <small class="hint">3–50 characters (letters, numbers, ., _, -). No spaces.</small>
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="new-password"
              required
            />
            <small class="hint">At least 8 characters</small>
          </div>

          <button class="button button-primary" type="submit">Register</button>
        </form>

        <p class="auth-link">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
};

module.exports = { renderRegisterPage };
