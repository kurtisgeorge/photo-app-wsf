const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderHomePage = ({ csrfToken, user }) => {
  const userName = user.name || user.username || 'there';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Home | Photo App</title>
    <link rel="stylesheet" href="/static/styles/dashboard.css" />
  </head>
  <body>
    <nav class="site-nav">
      <div class="nav-inner">
        <span class="nav-brand">Photo App</span>
        <div class="nav-links">
          <a href="/home" class="nav-link nav-link-active">Home</a>
          <a href="/dashboard" class="nav-link">Profile</a>
          <form class="nav-logout" action="/auth/logout" method="post">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <button class="nav-link nav-link-button" type="submit">Log out</button>
          </form>
        </div>
      </div>
    </nav>

    <div class="dashboard-shell home-shell">
      <header class="home-header" style="max-width: 600px; margin: 0 auto 2rem;">
        <h1 class="page-title">Feed</h1>
        <p class="section-copy">
          Welcome back, ${escapeHtml(userName)}. See what people are up to.
        </p>
      </header>

      <main class="feed-layout">
        <!-- post 1 -->
        <article class="feed-card">
          <div class="feed-card-header">
            <div class="feed-avatar">M</div>
            <div class="feed-header-text">
              <p class="feed-author">maya_photos</p>
              <p class="feed-time">2 hours ago</p>
            </div>
          </div>
          <div class="feed-image-placeholder">
            [ Photo: Golden hour on the river walk ]
          </div>
          <div class="feed-body">
            <p class="feed-caption"><strong>maya_photos</strong> Caught the perfect lighting today. No filter needed.</p>
            <div class="feed-tags">
              <span class="feed-tag">#sunset</span>
              <span class="feed-tag">#city</span>
            </div>
            <div class="feed-actions">
              <button class="feed-action-button">Like (18)</button>
              <button class="feed-action-button">Comment</button>
            </div>
          </div>
        </article>

        <!-- post 2 -->
        <article class="feed-card">
          <div class="feed-card-header">
            <div class="feed-avatar">L</div>
            <div class="feed-header-text">
              <p class="feed-author">leo_creative</p>
              <p class="feed-time">5 hours ago</p>
            </div>
          </div>
          <div class="feed-image-placeholder">
            [ Photo: Coffee and editing session ]
          </div>
          <div class="feed-body">
            <p class="feed-caption"><strong>leo_creative</strong> Fueling up for a long night of editing.</p>
            <div class="feed-tags">
              <span class="feed-tag">#workflow</span>
              <span class="feed-tag">#coffee</span>
            </div>
            <div class="feed-actions">
              <button class="feed-action-button">Like (9)</button>
              <button class="feed-action-button">Comment</button>
            </div>
          </div>
        </article>
        
        <!-- post 3 -->
        <article class="feed-card">
          <div class="feed-card-header">
            <div class="feed-avatar">S</div>
            <div class="feed-header-text">
              <p class="feed-author">sara_shoots</p>
              <p class="feed-time">1 day ago</p>
            </div>
          </div>
          <div class="feed-image-placeholder">
            [ Photo: Fog rolling over the hills ]
          </div>
          <div class="feed-body">
            <p class="feed-caption"><strong>sara_shoots</strong> Early mornings are always worth it.</p>
            <div class="feed-tags">
              <span class="feed-tag">#nature</span>
              <span class="feed-tag">#landscape</span>
            </div>
            <div class="feed-actions">
              <button class="feed-action-button">Like (27)</button>
              <button class="feed-action-button">Comment</button>
            </div>
          </div>
        </article>
      </main>
    </div>
  </body>
</html>`;
};

module.exports = { renderHomePage };
