const fs = require('fs');
const https = require('https');
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 60 * 60 * 24 * 30,
      includeSubDomains: true,
      preload: false
    }
  })
);

function cacheControl(value) {
  return (req, res, next) => {
    res.set('Cache-Control', value);
    next();
  };
}

const cachePolicies = {
  postsList: 'public, max-age=300, stale-while-revalidate=60',
  postDetails: 'public, max-age=300',
  publicFeed: 'public, max-age=120, stale-while-revalidate=30',
  userProfile: 'public, max-age=300',
  tagGallery: 'public, max-age=300, stale-while-revalidate=60',
  staticConfig: 'public, max-age=86400, immutable',
  noStore: 'no-store'
};

const posts = [
  {
    id: 1,
    author: 'maya',
    caption: 'Golden hour on the river walk.',
    imageUrl: '/assets/photo-1.jpg',
    tags: ['sunset', 'city', 'river'],
    likes: 18,
    createdAt: '2026-02-20T17:40:00Z'
  },
  {
    id: 2,
    author: 'leo',
    caption: 'Coffee and editing session.',
    imageUrl: '/assets/photo-2.jpg',
    tags: ['coffee', 'desk', 'workflow'],
    likes: 9,
    createdAt: '2026-02-21T09:15:00Z'
  },
  {
    id: 3,
    author: 'sara',
    caption: 'Fog rolling over the hills this morning.',
    imageUrl: '/assets/photo-3.jpg',
    tags: ['nature', 'morning', 'landscape'],
    likes: 27,
    createdAt: '2026-02-22T06:55:00Z'
  }
];

app.get('/health', cacheControl(cachePolicies.noStore), (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', cacheControl(cachePolicies.noStore), (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Photo App - API is Running</title>
  </head>
  <body>
    <h1>Photo App - API is Running</h1>
    <p>This local HTTPS server powers the photo sharing app API.</p>
    <ul>
      <li><a href="/posts">/posts</a></li>
      <li><a href="/posts/1">/posts/1</a></li>
      <li><a href="/feed/public">/feed/public</a></li>
      <li><a href="/users/maya">/users/maya</a></li>
      <li><a href="/tags/sunset">/tags/sunset</a></li>
      <li><a href="/health">/health</a></li>
      <li><a href="/config/public">/config/public</a></li>
    </ul>
  </body>
</html>`);
});

// Public list. Short cache is fine.
app.get('/posts', cacheControl(cachePolicies.postsList), (req, res) => {
  res.json({ count: posts.length, posts });
});

// Public item. Same idea.
app.get('/posts/:id', cacheControl(cachePolicies.postDetails), (req, res) => {
  const postId = Number(req.params.id);
  const post = posts.find((item) => item.id === postId);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  return res.json(post);
});

// Not personalized. Cache it briefly.
app.get('/feed/public', cacheControl(cachePolicies.publicFeed), (req, res) => {
  const trending = [...posts].sort((a, b) => b.likes - a.likes).slice(0, 2);

  res.json({
    feedType: 'public-discover',
    generatedAt: new Date().toISOString(),
    posts: trending
  });
});

// Public profile route.
app.get('/users/:username', cacheControl(cachePolicies.userProfile), (req, res) => {
  const username = req.params.username.toLowerCase();
  const userPosts = posts.filter((post) => post.author.toLowerCase() === username);

  res.json({
    username,
    bio: `${username} shares street and lifestyle photos.`,
    publicPostCount: userPosts.length,
    posts: userPosts
  });
});

app.get('/tags/:tag', cacheControl(cachePolicies.tagGallery), (req, res) => {
  const normalizedTag = req.params.tag.toLowerCase();
  const taggedPosts = posts.filter((post) =>
    post.tags.some((tag) => tag.toLowerCase() === normalizedTag)
  );

  res.json({
    tag: normalizedTag,
    total: taggedPosts.length,
    posts: taggedPosts
  });
});

app.get('/config/public', cacheControl(cachePolicies.staticConfig), (req, res) => {
  res.json({
    appName: 'Photo Sharing App',
    supportEmail: 'support@example.edu',
    features: ['public-feed', 'tags', 'profiles']
  });
});

// No cache on write/admin/user routes.
app.post('/posts', cacheControl(cachePolicies.noStore), (req, res) => {
  const { author, caption, imageUrl, tags } = req.body;

  if (!author || !caption || !imageUrl) {
    return res.status(400).json({
      error: 'author, caption, and imageUrl are required'
    });
  }

  const newPost = {
    id: posts.length + 1,
    author,
    caption,
    imageUrl,
    tags: Array.isArray(tags) ? tags : [],
    likes: 0,
    createdAt: new Date().toISOString()
  };

  posts.push(newPost);
  return res.status(201).json(newPost);
});

app.post('/posts/:id/like', cacheControl(cachePolicies.noStore), (req, res) => {
  const postId = Number(req.params.id);
  const post = posts.find((item) => item.id === postId);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  post.likes += 1;
  return res.status(200).json({ id: post.id, likes: post.likes });
});

app.get('/feed/me', cacheControl(cachePolicies.noStore), (req, res) => {
  res.json({
    message: 'User feed route not built yet. no-store stays on.'
  });
});

app.get('/admin/review-queue', cacheControl(cachePolicies.noStore), (req, res) => {
  res.json({
    queueCount: 0,
    note: 'Admin route not built yet. no-store stays on.'
  });
});

const certPath = path.join(__dirname, 'certs', 'localhost-cert.pem');
const keyPath = path.join(__dirname, 'certs', 'localhost-key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('Missing SSL certificate files.');
  console.error('Expected:');
  console.error(`- ${keyPath}`);
  console.error(`- ${certPath}`);
  console.error('Generate them with OpenSSL. See README.md for commands.');
  process.exit(1);
}

const sslOptions = {
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath)
};

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`HTTPS server is running at https://localhost:${PORT}`);
});
