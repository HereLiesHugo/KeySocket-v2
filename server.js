require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const https = require('node:https');
const http = require('node:http');

// Modules
const logger = require('./lib/logger');
const { sessionMiddleware, sessionStore } = require('./lib/session');
const authRoutes = require('./routes/auth');
const { initializeWebSocketServer } = require('./lib/websocket');

// App Setup
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const TURNSTILE_TOKEN_TTL_MS = Number.parseInt(process.env.TURNSTILE_TOKEN_TTL_MS || '30000', 10);

// Logging
logger.info('=== KeySocket Server Starting ===', {
  node_version: process.version,
  platform: process.platform,
  env: process.env.NODE_ENV || 'development'
});

// Proxy Settings
const BEHIND_PROXY = process.env.BEHIND_PROXY === undefined ? true : (process.env.BEHIND_PROXY === 'true');
app.set('trust proxy', BEHIND_PROXY ? (process.env.TRUST_PROXY || 1) : false);

// Passport Config
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.APP_BASE_URL + '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    return done(null, {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      picture: profile.photos[0].value
    });
  }
));

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

// CSP
app.use((req, res, next) => {
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader("Content-Security-Policy", 
      "default-src 'self'; " +
      "script-src 'self' " +
        "'sha256-GAEWvptc7gBRWsWwhJ4hc8G4xPAH6dlDCDRyN3QrxQg=' " +
        "'sha256-XE/rk1B1hi3MM4L/gFLf0ld8k4UBfe30haqIxm4Om+0=' " +
        "'sha256-sSE0eU9JEHCECAOMSXkHIyD43AmAVBPvw56cdRedOyI=' " +
        "https://challenges.cloudflare.com " +
        "https://cdn.jsdelivr.net " +
        "https://static.cloudflareinsights.com; " +
      "style-src 'self' 'unsafe-inline' " +
        "https://cdn.jsdelivr.net " +
        "https://fonts.googleapis.com " +
        "https://cdnjs.cloudflare.com; " +
      "font-src 'self' " +
        "https://fonts.gstatic.com " +
        "https://cdnjs.cloudflare.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' ws: wss: " +
        "https://cloudflareinsights.com " +
        "https://challenges.cloudflare.com " +
        "https://static.cloudflareinsights.com; " +
      "frame-src 'self' https://challenges.cloudflare.com; " +
      "worker-src 'self' blob:; " +
      "child-src 'self' blob:;"
    );
  }
  next();
});

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://keysocket.eu', 'https://www.keysocket.eu',
    'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com',
    'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
    'https://challenges.cloudflare.com'
  ];
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'https://keysocket.eu');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT || '120', 10),
  skip: (req) => /googlebot|bingbot/i.test(req.headers['user-agent'] || ''),
  standardHeaders: true,
  legacyHeaders: true,
}));

// Routes
app.use('/auth', authRoutes);

// Static Files
const ASSET_VERSION = process.env.ASSET_VERSION || String(Date.now());
const staticOpts = { maxAge: '1d', etag: true };
app.use('/lib', express.static('lib', { ...staticOpts, maxAge: '1y', setHeaders: (res, p) => {
  if (p.endsWith('.js') || p.endsWith('.css')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}}));
app.use('/js', express.static('js', staticOpts));

// Environment Variables for Frontend
app.get('/js/env.js', (req, res) => {
  try {
    const p = path.join(__dirname, 'js', 'env.js');
    if (!fs.existsSync(p)) return res.status(404).send('Not Found');
    let content = fs.readFileSync(p, 'utf8');
    content = content.replaceAll('__TURNSTILE_SITEKEY__', process.env.TURNSTILE_SITEKEY || '');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(content);
  } catch (e) {
    logger.error('Error serving env.js', { error: e.message });
    res.status(500).send('Server Error');
  }
});

app.use(express.static(__dirname, { index: false }));

// Xterm libs
const nm = path.join(__dirname, 'node_modules');
app.get('/lib/xterm.css', (req, res) => res.sendFile(path.join(nm, '@xterm/xterm/css/xterm.css')));
app.get('/lib/xterm.js', (req, res) => res.sendFile(path.join(nm, '@xterm/xterm/lib/xterm.js')));
app.get('/lib/xterm-addon-fit.js', (req, res) => res.sendFile(path.join(nm, '@xterm/addon-fit/lib/addon-fit.js')));
app.get('/lib/xterm-addon-webgl.js', (req, res) => res.sendFile(path.join(nm, '@xterm/addon-webgl/lib/addon-webgl.js')));

// Pages
const servePage = (file) => (req, res) => {
  try {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) return res.status(404).send('Not Found');
    let html = fs.readFileSync(p, 'utf8');
    html = html.replaceAll('__ASSET_VERSION__', ASSET_VERSION);
    html = html.replaceAll('__TURNSTILE_SITEKEY__', process.env.TURNSTILE_SITEKEY || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    logger.error('Error serving page', { file, error: e.message });
    res.status(500).send('Server Error');
  }
};
app.get('/', servePage('index.html'));
app.get('/index.html', servePage('index.html'));
app.get('/console', servePage('console.html'));
app.get('/console.html', servePage('console.html'));
app.get('/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development' }));

// Turnstile Verification Endpoint
app.post('/turnstile-verify', (req, res) => {
  logger.info('[Turnstile] Received verification request');
  const token = req.body?.token;
  if (!token) return res.status(400).json({ ok: false });
  if (!process.env.TURNSTILE_SECRET) return res.status(500).json({ ok: false });

  // Use dummy Cloudflare call logic or refactor fully. 
  // For now, let's keep the core logic inline or import if we extracted strictly.
  // We extracted consumeVerifiedToken but that's for AFTER verification.
  // The actual HTTP check to cloudflare was in server.js.
  // Re-implementing simplified version:
  
  const postData = `secret=${encodeURIComponent(process.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.socket.remoteAddress)}`;
  const r2 = https.request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
  }, resp => {
    let data = '';
    resp.on('data', c => data += c);
    resp.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.success) {
            if (!req.session) return res.status(500).json({ok:false});
            const serverToken = require('node:crypto').randomBytes(24).toString('hex');
            req.session.turnstileToken = serverToken;
            req.session.turnstileTokenExpires = Date.now() + TURNSTILE_TOKEN_TTL_MS;
            req.session.turnstileVerifiedIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
            req.session.save(() => {
                res.json({ ok: true, token: serverToken, ttl: TURNSTILE_TOKEN_TTL_MS });
            });
        } else {
            res.status(400).json({ ok: false });
        }
      } catch(e) {
        logger.error('[Turnstile] JSON parse error', { error: e.message });
        res.status(500).json({ ok: false }); 
      }
    });
  });
  r2.write(postData);
  r2.end();
});

// Start Server
let server;
const USE_TLS = process.env.USE_TLS === 'true';
const TLS_KEY = process.env.TLS_KEY;
const TLS_CERT = process.env.TLS_CERT;

if (USE_TLS && fs.existsSync(TLS_KEY) && fs.existsSync(TLS_CERT)) {
  server = https.createServer({ key: fs.readFileSync(TLS_KEY), cert: fs.readFileSync(TLS_CERT) }, app);
  logger.info('Starting HTTPS server');
} else {
  server = http.createServer(app);
  logger.info('Starting HTTP server');
}

// WebSocket
initializeWebSocketServer(server, sessionMiddleware, sessionStore);

server.listen(PORT, HOST, () => {
  logger.info(`KeySocket Server listening on ${HOST}:${PORT}`);
  logger.info('Refactored modular structure active');
});