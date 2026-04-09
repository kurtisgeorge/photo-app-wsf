const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderValue = (value, fallback) => {
  if (value && String(value).trim()) {
    return escapeHtml(value);
  }

  return `<span class="placeholder-text">${escapeHtml(fallback)}</span>`;
};

const renderDashboardPage = ({ csrfToken, logoutPath, updatePath, user, flash }) => {
  const userName = user.name || user.username || 'Account';
  const profileEmail = user.email || '';
  const profileBio = user.bio || '';

  const flashHtml = flash
    ? `<div class="flash flash-${flash.type === 'error' ? 'error' : 'success'}" role="${flash.type === 'error' ? 'alert' : 'status'}">${escapeHtml(flash.message)}</div>`
    : '';

  const errorMap = (flash && flash.errors) || {};
  const fieldError = (name) => {
    if (!errorMap[name]) return '';
    return `<small class="field-error">${escapeHtml(errorMap[name])}</small>`;
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(userName)} | Secure Dashboard</title>
    <link rel="stylesheet" href="/static/styles/dashboard.css" />
  </head>
  <body>
    <nav class="site-nav">
      <div class="nav-inner">
        <span class="nav-brand">Photo App</span>
        <div class="nav-links">
          <a href="/home" class="nav-link">Home</a>
          <a href="/dashboard" class="nav-link nav-link-active">Profile</a>
          <form class="nav-logout" action="${escapeHtml(logoutPath)}" method="post">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <button class="nav-link nav-link-button" type="submit">Log out</button>
          </form>
        </div>
      </div>
    </nav>

    <div class="dashboard-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Secure account</p>
          <h1 class="page-title">Welcome back, ${escapeHtml(userName)}</h1>
        </div>
      </header>

      ${flashHtml}

      <main class="dashboard-grid">
        <section class="panel panel-hero" aria-labelledby="dashboard-intro-title">
          <div class="hero-copy">
            <p class="section-kicker">Dashboard</p>
            <h2 id="dashboard-intro-title">Your account at a glance.</h2>
            <p class="section-copy">
              Review your profile details below or make changes using the update form.
              All sensitive data is encrypted before storage.
            </p>
          </div>
          <dl class="hero-meta" aria-label="Account summary">
            <div class="meta-row">
              <dt>Role</dt>
              <dd>${escapeHtml(user.role || 'User')}</dd>
            </div>
            <div class="meta-row">
              <dt>User ID</dt>
              <dd>${renderValue(user.id, 'Assigned on registration')}</dd>
            </div>
          </dl>
        </section>

        <section class="panel" aria-labelledby="profile-overview-title">
          <div class="panel-header">
            <p class="section-kicker">Profile</p>
            <h2 id="profile-overview-title">Profile information</h2>
          </div>
          <dl class="profile-list">
            <div class="profile-row">
              <dt>Username</dt>
              <dd>${renderValue(userName, 'Not set yet')}</dd>
            </div>
            <div class="profile-row">
              <dt>Email</dt>
              <dd>${renderValue(profileEmail, 'Not set yet')}</dd>
            </div>
            <div class="profile-row">
              <dt>Bio</dt>
              <dd>${renderValue(profileBio, 'Not set yet')}</dd>
            </div>
          </dl>
        </section>

        <section class="panel" aria-labelledby="profile-update-title">
          <div class="panel-header">
            <p class="section-kicker">Edit</p>
            <h2 id="profile-update-title">Update profile</h2>
            <p class="section-copy section-copy-compact">
              Changes are validated on the server and sensitive fields are encrypted before storage.
            </p>
          </div>

          <form class="profile-form" action="${escapeHtml(updatePath)}" method="post" novalidate>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

            <div class="field">
              <label for="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                value="${escapeHtml(userName !== 'Account' ? userName : '')}"
                autocomplete="username"
                required
              />
              <small class="hint">3–50 characters (letters, numbers, ., _, -)</small>
              ${fieldError('username')}
            </div>

            <div class="field">
              <label for="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value="${escapeHtml(profileEmail)}"
                placeholder="name@example.com"
                autocomplete="email"
                required
              />
              <small class="hint">Used for notifications and account recovery.</small>
              ${fieldError('email')}
            </div>

            <div class="field">
              <label for="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                rows="5"
                placeholder="Add a short introduction for your profile."
              >${escapeHtml(profileBio)}</textarea>
              <small class="hint">Max 500 characters, no HTML tags or special characters</small>
              ${fieldError('bio')}
            </div>

            <div class="form-footer">
              <button class="button button-primary" type="submit">
                Update profile
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  </body>
</html>`;
};

module.exports = { renderDashboardPage };
