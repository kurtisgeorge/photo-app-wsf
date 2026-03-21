const fs = require('fs');
const https = require('https');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');

const app = express();
const PORT = 3000;

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// session for oauth
app.use(
  session({
    secret: process.env.JWT_SECRET, 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true }
  })
);

// passport setup
app.use(passport.initialize());
app.use(passport.session());

// csrf on cookies
const csrfProtection = csurf({ cookie: true });
app.use(csrfProtection);

// slow down login spam
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// csrf errors
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token' });
  } else {
    next(err);
  }
});

const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Access token expired.' });
    }
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access this resource.' });
    }
    next();
  };
};

app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.get('/profile', authenticateJWT, (req, res) => {
  res.json({
    message: 'Your Profile',
    user: req.user
  });
});


app.get('/admin', authenticateJWT, authorizeRoles('Admin'), (req, res) => {
  res.json({
    message: 'Welcome to the Admin Panel',
    adminData: {
      totalUsers: users.length,
      totalPosts: posts.length,
      serverUptime: `${process.uptime().toFixed(2)} seconds`
    }
  });
});

app.get('/dashboard', authenticateJWT, (req, res) => {
  const { username, role } = req.user;

  if (role === 'Admin') {
    res.json({
      message: `Admin Dashboard for ${username}`,
      adminWidgets: ['User Management', 'Content Moderation', 'System Analytics']
    });
  } else {
    res.json({
      message: `User Dashboard for ${username}`,
      userWidgets: ['My Posts', 'My Favorites', 'Account Settings']
    });
  }
});




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

// demo user store
const users = [
  {
    id: 1,
    username: 'maya',
    hashedPassword:
      '$2b$10$E9CM4lQ5/2e.3Tpr.1Yfje3C.UPgBv6l7h2ED323iIu2eGsn3gRjS',
    role: 'Admin',
    oauthProvider: null,
    oauthId: null
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

app.get('/posts', cacheControl(cachePolicies.postsList), (req, res) => {
  res.json({ count: posts.length, posts });
});

app.get('/posts/:id', cacheControl(cachePolicies.postDetails), (req, res) => {
  const postId = Number(req.params.id);
  const post = posts.find((item) => item.id === postId);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  return res.json(post);
});

app.get('/feed/public', cacheControl(cachePolicies.publicFeed), (req, res) => {
  const trending = [...posts].sort((a, b) => b.likes - a.likes).slice(0, 2);

  res.json({
    feedType: 'public-discover',
    generatedAt: new Date().toISOString(),
    posts: trending
  });
});

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

// no cache here
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

app.get('/feed/me', authenticateJWT, (req, res) => {
  const userPosts = posts.filter(
    (post) => post.author.toLowerCase() === req.user.username.toLowerCase()
  );

  res.json({
    message: `Feed for user ${req.user.username}`,
    posts: userPosts
  });
});

app.get('/admin/review-queue', cacheControl(cachePolicies.noStore), (req, res) => {
  res.json({
    queueCount: 0,
    note: 'Admin route not built yet. no-store stays on.'
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `https://localhost:${PORT}/auth/google/callback`
    },
    (accessToken, refreshToken, profile, done) => {
      const googleId = profile.id;
      const displayName = profile.displayName;

      let user = users.find((u) => u.oauthProvider === 'google' && u.oauthId === googleId);

      if (user) {
        return done(null, user);
      } else {
        const newUser = {
          id: users.length + 1,
          username: displayName.replace(/\s/g, '').toLowerCase() + Math.floor(Math.random() * 1000),
          hashedPassword: null,
          role: 'User',
          oauthProvider: 'google',
          oauthId: googleId
        };
        users.push(newUser);
        return done(null, newUser);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = users.find((u) => u.id === id);
  done(null, user);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login-error',
    session: false
  }),
  (req, res) => {
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const user = req.user;
      req.session.user = user;

      const token = generateToken(user);

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hour
      });

      res.redirect('/feed/me');
    });
  }
);

app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const existingUser = users.find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: users.length + 1,
      username,
      hashedPassword,
      role: 'User',
      oauthProvider: null,
      oauthId: null
    };

    users.push(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: newUser.id, username: newUser.username }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

app.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );

    if (!user || !user.hashedPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // reset session on login
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      req.session.user = user;

      const token = generateToken(user);

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 
      });

      res.json({
        message: 'Login successful',
        user: { id: user.id, username: user.username, role: user.role }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout successful' });
});

app.post('/auth/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  // fake reset response (for now)
  res.status(200).json({
    message:
      'If an account with that email exists, a password reset link has been sent.'
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
