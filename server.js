require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { WebSocketServer } = require('ws');
const https = require('https');
const http = require('http');
const { Client } = require('ssh2');
const { URL } = require('url');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const USE_TLS = process.env.USE_TLS === 'true';
const TLS_KEY = process.env.TLS_KEY || '';
const TLS_CERT = process.env.TLS_CERT || '';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';

// --- Session and Authentication Setup ---
const sessionParser = session({
  secret: process.env.SESSION_SECRET || 'a_very_secret_default_key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: USE_TLS, maxAge: 1000 * 60 * 60 * 24 } // 1 day
});
app.use(sessionParser);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  // Store a minimal user object in the session
  done(null, {
      id: user.id,
      displayName: user.displayName,
      photo: user.photos?.[0]?.value,
      email: user.emails?.[0]?.value
  });
});
passport.deserializeUser((obj, done) => {
  // The object from the session is returned as is
  done(null, obj);
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.APP_BASE_URL || `http://localhost:${PORT}`}/auth/google/callback`
    },
    (accessToken, refreshToken, profile, done) => {
      // In a real app, you would find or create a user in your database here.
      return done(null, profile);
    }
  ));
} else {
  console.warn('Google OAuth credentials not found in .env file. Login will not work.');
}

// --- Security Middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://challenges.cloudflare.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["https://challenges.cloudflare.com", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com", "https://www.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"], // Allow user profile images from Google from Google
    }
  },
  crossOriginResourcePolicy: false
}));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 500, // Stricter in prod
});
app.use(limiter);

// --- Static File Serving ---
const publicDir = path.join(__dirname);
app.use(express.static(publicDir, { index: false }));
app.get('/lib/xterm.css', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/css/xterm.css')));
app.get('/lib/xterm.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/lib/xterm.js')));
app.get('/lib/xterm-addon-fit.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/@xterm/addon-fit/lib/addon-fit.js')));
app.get('/lib/xterm-addon-webgl.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js')));

const ASSET_VERSION = process.env.ASSET_VERSION || (() => {
  try { return require(path.join(__dirname, 'package.json')).version || String(Date.now()); } catch (e) { return String(Date.now()); }
})();

function serveIndex(req, res) {
  try {
    const indexPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace(/__ASSET_VERSION__/g, ASSET_VERSION);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    return res.status(500).send('Server error');
  }
}
app.get('/', serveIndex);

// --- Authentication Routes ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get('/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/' }),
      (req, res) => {
        res.redirect('/'); // Successful auth, redirect home.
      }
    );
}
app.get('/logout', (req, res, next) => {
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
});

// --- API Routes ---
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      isAuthenticated: true,
      user: {
        displayName: req.user.displayName,
        photo: req.user.photos && req.user.photos[0].value
      }
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// --- Server and WebSocket Setup ---
let server;
if (USE_TLS && TLS_KEY && TLS_CERT) {
  try {
    const key = fs.readFileSync(TLS_KEY);
    const cert = fs.readFileSync(TLS_CERT);
    server = https.createServer({ key, cert }, app);
  } catch (e) {
    console.error('TLS cert/key error - falling back to http.', e);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

const wss = new WebSocketServer({
  noServer: true // We manually handle the upgrade to integrate session parsing
});

server.on('upgrade', (request, socket, head) => {
  // Use session parser to find the user session for the upgrade request
  sessionParser(request, {}, () => {
    if (!request.session.passport || !request.session.passport.user) {
      console.log(`[Security] WebSocket upgrade rejected for unauthenticated user.`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
});

wss.on('connection', (ws, req) => {
  const userName = req.session.passport.user.displayName;
  console.log(`Client connected: ${userName}`);
  
  // ... (Your existing WebSocket 'message' and 'close' logic goes here)
  // Make sure to adapt it to be inside this 'connection' event handler

  ws.on('error', console.error);
});


server.listen(PORT, HOST, () => {
  console.log(`Server listening on ${USE_TLS ? 'https' : 'http'}://${HOST}:${PORT}`);
});