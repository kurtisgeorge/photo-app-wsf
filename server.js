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
const { body, validationResult } = require('express-validator');
const { encrypt, decrypt } = require('./crypto-utils');

const { renderDashboardPage } = require('./views/dashboard');
const { renderLoginPage } = require('./views/login');
const { renderRegisterPage } = require('./views/register');
const { renderHomePage } = require('./views/home');

const app = express();
const PORT = 3000;

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// serving assets
app.use('/static', express.static(path.join(__dirname, 'public')));

// session setup
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

// csrf using cookies
const csrfProtection = csurf({ cookie: true });
app.use(csrfProtection);

// rate limit login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.clearCookie('token');
      return res.redirect('/login');
    }
    return res.redirect('/login');
  }
};

// api jwt check
const authenticateJWTapi = (req, res, next) => {
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

app.get('/profile', authenticateJWTapi, (req, res) => {
  res.json({
    message: 'Your Profile',
    user: req.user
  });
});


app.get('/admin', authenticateJWTapi, authorizeRoles('Admin'), (req, res) => {
  res.json({
    message: 'Welcome to the Admin Panel',
    adminData: {
      totalUsers: users.length,
      totalPosts: posts.length,
      serverUptime: `${process.uptime().toFixed(2)} seconds`
    }
  });
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

// dummy user store: bio/email encrypted after profile hit
const users = [
  {
    id: 1,
    username: 'maya',
    hashedPassword:
      '$2b$10$E9CM4lQ5/2e.3Tpr.1Yfje3C.UPgBv6l7h2ED323iIu2eGsn3gRjS',
    role: 'Admin',
    oauthProvider: null,
    oauthId: null,
    name: 'Maya',
    email: '',   // will be encrypted after first profile update
    bio: ''      // will be encrypted after first profile update
  }
];


// views
// ──────────────────────────────────────────────────────────────────

// Login page
app.get('/login', (req, res) => {
  // If already logged in, go to home
  const token = req.cookies.token;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect('/home');
    } catch (_) { /* invalid token */ }
  }

  res.type('html').send(renderLoginPage({
    csrfToken: req.csrfToken(),
    error: null
  }));
});

// Register page
app.get('/register', (req, res) => {
  res.type('html').send(renderRegisterPage({
    csrfToken: req.csrfToken(),
    error: null,
    success: null
  }));
});

// authenticated landing page
app.get('/home', authenticateJWT, (req, res) => {
  const user = users.find((u) => u.id === req.user.id);

  if (!user) {
    res.clearCookie('token');
    return res.redirect('/login');
  }

  res.type('html').send(renderHomePage({
    csrfToken: req.csrfToken(),
    user: {
      username: user.username,
      name: user.name || user.username,
      role: user.role
    }
  }));
});

// secure dashboard
app.get('/dashboard', authenticateJWT, (req, res) => {
  const user = users.find((u) => u.id === req.user.id);

  if (!user) {
    res.clearCookie('token');
    return res.redirect('/login');
  }

  // decrypt entries for display
  const decryptedEmail = decrypt(user.email || '');
  const decryptedBio = decrypt(user.bio || '');

  // session flash check
  const flash = req.session.flash || null;
  delete req.session.flash;

  res.type('html').send(renderDashboardPage({
    csrfToken: req.csrfToken(),
    logoutPath: '/auth/logout',
    updatePath: '/dashboard/update',
    user: {
      id: user.id,
      username: user.username,
      name: user.name || user.username,
      email: decryptedEmail,
      bio: decryptedBio,
      role: user.role
    },
    flash
  }));
});


// profile update: validate/sanitise/encrypt

// validation rules per assignment requirements
const profileValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Name must be 3–50 characters.')
    .matches(/^[A-Za-z\s]+$/).withMessage('Name must contain only letters and spaces.'),

  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('bio')
    .trim()
    .isLength({ max: 500 }).withMessage('Bio must be 500 characters or fewer.')
    .custom((value) => {
      // block tags
      if (/<[^>]*>/.test(value)) {
        throw new Error('Bio must not contain HTML tags.');
      }
      // basic character only
      if (/[^A-Za-z0-9\s.,!?;:'"()\-\n\r]/.test(value)) {
        throw new Error('Bio must not contain special characters.');
      }
      return true;
    })
];

app.post('/dashboard/update', authenticateJWT, profileValidation, (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // map errors by field
    const errorMap = {};
    errors.array().forEach((e) => {
      if (!errorMap[e.path]) {
        errorMap[e.path] = e.msg;
      }
    });

    req.session.flash = {
      type: 'error',
      message: 'Please fix the errors below.',
      errors: errorMap
    };
    return req.session.save(() => res.redirect('/dashboard'));
  }

  const user = users.find((u) => u.id === req.user.id);
  if (!user) {
    res.clearCookie('token');
    return res.redirect('/login');
  }

  // sanitized values via express-validator
  const { name, email, bio } = req.body;

  // encrypt and store
  user.name = name;
  user.email = encrypt(email);
  user.bio = encrypt(bio || '');

  // logging for demo check
  console.log(`[Profile Updated] user=${user.username}`);
  console.log(`  name (plain): ${user.name}`);
  console.log(`  email (encrypted): ${user.email}`);
  console.log(`  bio (encrypted): ${user.bio}`);

  req.session.flash = {
    type: 'success',
    message: 'Profile updated successfully.'
  };
  req.session.save(() => res.redirect('/dashboard'));
});


// api endpoints (phase 2)
// ──────────────────────────────────────────────────────────────────

app.get('/health', cacheControl(cachePolicies.noStore), (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', cacheControl(cachePolicies.noStore), (req, res) => {
  res.redirect('/login');
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

// post creation
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

app.get('/feed/me', authenticateJWTapi, (req, res) => {
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
          oauthId: googleId,
          name: displayName,
          email: '',
          bio: ''
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
    failureRedirect: '/login',
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

      res.redirect('/home');
    });
  }
);

// account creation
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.type('html').send(renderRegisterPage({
      csrfToken: req.csrfToken(),
      error: 'Username and password are required.',
      success: null
    }));
  }

  // Validate username: 3–50 characters (alphanumeric, periods, underscores, dashes)
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
    return res.type('html').send(renderRegisterPage({
      csrfToken: req.csrfToken(),
      error: 'Username must be 3–50 characters (letters, numbers, ., _, -).',
      success: null
    }));
  }

  // Validate password: at least 8 characters
  if (password.length < 8) {
    return res.type('html').send(renderRegisterPage({
      csrfToken: req.csrfToken(),
      error: 'Password must be at least 8 characters.',
      success: null
    }));
  }

  try {
    const existingUser = users.find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );

    if (existingUser) {
      return res.type('html').send(renderRegisterPage({
        csrfToken: req.csrfToken(),
        error: 'Username already exists.',
        success: null
      }));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: users.length + 1,
      username,
      hashedPassword,
      role: 'User',
      oauthProvider: null,
      oauthId: null,
      name: username,
      email: '',
      bio: ''
    };

    users.push(newUser);

    res.type('html').send(renderRegisterPage({
      csrfToken: req.csrfToken(),
      error: null,
      success: 'Account created! You can now log in.'
    }));
  } catch (error) {
    console.error('Registration error:', error);
    res.type('html').send(renderRegisterPage({
      csrfToken: req.csrfToken(),
      error: 'Something went wrong. Please try again.',
      success: null
    }));
  }
});

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// login post
app.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.type('html').send(renderLoginPage({
      csrfToken: req.csrfToken(),
      error: 'Username and password are required.'
    }));
  }

  try {
    const user = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );

    if (!user || !user.hashedPassword) {
      return res.type('html').send(renderLoginPage({
        csrfToken: req.csrfToken(),
        error: 'Invalid username or password.'
      }));
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!isMatch) {
      return res.type('html').send(renderLoginPage({
        csrfToken: req.csrfToken(),
        error: 'Invalid username or password.'
      }));
    }

    // clear session on login
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.type('html').send(renderLoginPage({
          csrfToken: req.csrfToken(),
          error: 'Something went wrong. Please try again.'
        }));
      }

      req.session.user = user;

      const token = generateToken(user);

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 
      });

      res.redirect('/home');
    });
  } catch (error) {
    console.error('Login error:', error);
    res.type('html').send(renderLoginPage({
      csrfToken: req.csrfToken(),
      error: 'Something went wrong. Please try again.'
    }));
  }
});

// logout handle
app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  req.session.destroy(() => {
    res.redirect('/login');
  });
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


// csrf error handler (after routes)
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).send('Invalid or missing CSRF token. Please go back and try again.');
  }
  next(err);
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
