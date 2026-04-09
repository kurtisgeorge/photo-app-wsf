const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderLoginPage = ({ csrfToken, error }) => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Log In | Photo App</title>
    <link rel="stylesheet" href="/static/styles/login.css" />
  </head>
  <body>
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-header">
          <p class="eyebrow">Photo App</p>
          <h1>Log in</h1>
        </div>

        ${error ? `<div class="flash flash-error" role="alert">${escapeHtml(error)}</div>` : ''}

        <form class="auth-form" action="/auth/login" method="post" novalidate>
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
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>

          <button class="button button-primary" type="submit">Log in</button>
        </form>

        <p class="auth-link">
          Don&rsquo;t have an account? <a href="/register">Register</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
};

module.exports = { renderLoginPage };
