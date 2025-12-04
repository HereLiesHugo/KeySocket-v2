require('dotenv').config();
const net = require('net');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { WebSocketServer } = require('ws');
const https = require('https');
const http = require('http');
const { Client } = require('ssh2');
const { URL } = require('url');
const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const dns = require('dns').promises; // ADDED: Required for SSRF fix

// Enhanced logging system
const logFile = path.join(__dirname, 'server.log');
const logLevel = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error

function writeLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}\n`;

  // Write to file
  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }

  // Console output with colors
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };

  const levelColors = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.cyan,
    debug: colors.blue
  };

  const color = levelColors[level] || colors.reset;
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

// Enhanced logging functions
const logger = {
  error: (message, meta) => writeLog('error', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  info: (message, meta) => writeLog('info', message, meta),
  debug: (message, meta) => {
    if (logLevel === 'debug') writeLog('debug', message, meta);
  }
};

// Log server startup
logger.info('=== KeySocket Server Starting ===', {
  node_version: process.version,
  platform: process.platform,
  env: process.env.NODE_ENV || 'development'
});

const app = express();

// ensure secure cookies (sessions) work when behind a proxy/CDN like Cloudflare
// Allow explicit override with BEHIND_PROXY env var. Default to true (assume proxy in front).
const BEHIND_PROXY = typeof process.env.BEHIND_PROXY !== 'undefined' ? (process.env.BEHIND_PROXY === 'true') : true;
app.set('trust proxy', BEHIND_PROXY);
logger.info('trust proxy set', { trust_proxy: BEHIND_PROXY });

// Passport session setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Google OAuth strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.APP_BASE_URL + '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Store user profile in session
    return done(null, {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      picture: profile.photos[0].value
    });
  }
));

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const USE_TLS = process.env.USE_TLS === 'true';
const REQUIRE_TLS = process.env.REQUIRE_TLS === 'true'; // Fail startup if TLS required but not available
const TLS_KEY = process.env.TLS_KEY || '/etc/letsencrypt/live/keysocket.eu/privkey.pem';
const TLS_CERT = process.env.TLS_CERT || '/etc/letsencrypt/live/keysocket.eu/fullchain.pem';

// Basic security
app.use(helmet({
  contentSecurityPolicy: false, // Disabled: We handle CSP in Nginx
  crossOriginResourcePolicy: false
}));

// CSP fallback in case Nginx misconfiguration (matches Nginx config + additional hashes)
app.use((req, res, next) => {
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader("Content-Security-Policy", 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' " +
        "'sha256-51AbVm95/bXyZWOhL4XUEH7oO//14QSsMzS9dJ4HAHI=' " +
        "'sha256-YjP9NejlrkKr07NlpI0X4jV+JyxjWifNyQbWA/sqfu8=' " +
        "'sha256-gj6IB38jtvdWbaqYbrth6Tfn/uGW8gNDaQX5n47a/rY=' " +
        "'sha256-b5ZZ7GeGNY3rnCsgVzgKDt3i/OU504qSTwaIOSqu0xA=' " +
        "'sha256-zJ0i5jxdSrH1FnKjFTtqndCZv4sOOinr2V0FYy/qUYM=' " +
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

// CORS middleware for cross-origin requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow same-origin and specific CDN domains
  const allowedOrigins = [
    'https://keysocket.eu',
    'https://www.keysocket.eu',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://challenges.cloudflare.com'
  ];
  
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));

// Static file serving with caching
app.use('/lib', express.static('lib', {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.use('/js', express.static('js', {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Helper: determine remote IP with proxy awareness
function getReqRemoteIp(req) {
  if (BEHIND_PROXY && req && req.headers && req.headers['x-forwarded-for']) {
    // x-forwarded-for may be a comma-separated list
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  return req && req.socket ? req.socket.remoteAddress : 'unknown';
}

// Session parser for WebSocket connections
// Now accepts the full `req` object so we can bind/verify IPs and set timeouts
function parseWebSocketSession(req, callback) {
  const cookieHeader = req && req.headers ? req.headers.cookie : null;
  if (!cookieHeader) {
    logger.debug('WebSocket connection without cookie header', { ip: getReqRemoteIp(req) });
    return callback(null, null);
  }

  // Check if sessionStore is available
  if (!sessionStore) {
    logger.error('Session store not available for WebSocket authentication');
    return callback(null, null);
  }

  try {
    const cookies = cookie.parse(cookieHeader);
    const rawSessionId = cookies['connect.sid'];

    logger.debug('WebSocket session authentication attempt', {
      session_id: rawSessionId ? rawSessionId.substring(0, 20) + '...' : 'null',
      cookie_present: !!rawSessionId
    });

    if (!rawSessionId) {
      logger.debug('No connect.sid found in WebSocket cookies', { ip: getReqRemoteIp(req) });
      return callback(null, null);
    }

    // Verify the signed cookie signature
    const sessionId = cookieParser.signedCookie(rawSessionId, process.env.SESSION_SECRET);
    if (!sessionId) {
      logger.warn('WebSocket session signature verification failed', {
        raw_session_id: rawSessionId.substring(0, 20) + '...'
      });
      return callback(null, null);
    }

    // Remove the 's:' prefix (FileStore stores the full signed ID)
    let cleanSessionId = sessionId;
    if (sessionId.startsWith('s:')) {
      cleanSessionId = sessionId.slice(2);
    }

    logger.debug('Processing WebSocket session', {
      original_id: sessionId.substring(0, 20) + '...',
      clean_id: cleanSessionId,
      store_type: typeof sessionStore,
      has_get_method: typeof sessionStore.get
    });

    // Get session from store with a timeout to avoid hanging upgrades
    const GET_TIMEOUT_MS = parseInt(process.env.SESSION_STORE_GET_TIMEOUT_MS || '2000', 10);
    let called = false;
    const timer = setTimeout(() => {
      called = true;
      logger.error('Session store get timeout', { session_id: cleanSessionId, timeout_ms: GET_TIMEOUT_MS });
      return callback(new Error('session timeout'), null);
    }, GET_TIMEOUT_MS);

    sessionStore.get(cleanSessionId, (err, session) => {
      if (called) return; // already timed out
      clearTimeout(timer);

      if (err) {
        logger.error('Error retrieving WebSocket session from store', {
          session_id: cleanSessionId,
          error: err.message
        });
        return callback(err, null);
      }

      if (!session) {
        logger.warn('WebSocket session not found in store', {
          session_id: cleanSessionId
        });
        return callback(null, null);
      }

      logger.debug('WebSocket session found, checking authentication');

      // Attach sessionId and any Turnstile binding found
      const turnstileVerifiedIP = session.turnstileVerifiedIP || null;

      // Check if user is authenticated via Passport
      if (session.passport && session.passport.user) {
        logger.info('WebSocket user authenticated successfully', {
          session_id: cleanSessionId,
          user_email: session.passport.user.email,
          user_name: session.passport.user.name
        });

        return callback(null, {
          authenticated: true,
          user: session.passport.user,
          session: session, // Include session object for Turnstile token verification
          sessionId: cleanSessionId,
          turnstileVerifiedIP: turnstileVerifiedIP
        });
      }

      logger.warn('WebSocket session exists but user not authenticated', {
        session_id: cleanSessionId,
        has_passport: !!session.passport
      });

      return callback(null, null);
    });
  } catch (error) {
    logger.error('Exception in WebSocket session parsing', {
      error: error.message,
      stack: error.stack
    });
    callback(null, null);
  }
}

// Session configuration (reusable for Express and WebSocket)
const FileStore = require('session-file-store')(session);

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Create session store explicitly
const sessionStore = new FileStore({ 
  path: sessionsDir, 
  ttl: 86400, // 24 hours
  retries: 0,
  // Stop endless logging on session file cleanup errors
  reapInterval: -1, // Clean up expired sessions every hour (in milliseconds)
  // CHANGE 2: Silence the library's internal logging
  logFn: function() {},
  secret: process.env.FILESTORE_ENCRYPTION_KEY
});

// Derive cookie.secure from runtime: if we're terminating TLS at the proxy
// or running TLS in-process, mark cookies as Secure. Allow overriding sameSite via env.
const cookieSecure = (process.env.USE_TLS === 'true') || BEHIND_PROXY;
let cookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax');
// Browsers require SameSite=None to be paired with Secure flag; enforce that.
if (cookieSameSite.toLowerCase() === 'none' && !cookieSecure) {
  logger.warn('SESSION_COOKIE_SAMESITE set to "none" but cookies would not be Secure; overriding to "lax" to avoid browser rejection');
  cookieSameSite = 'lax';
}

const sessionConfig = {
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: !!cookieSecure,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: cookieSameSite
  }
};

// Log session cookie settings (masked/summary only)
logger.info('Session configuration', {
  cookie_secure: sessionConfig.cookie.secure,
  cookie_sameSite: sessionConfig.cookie.sameSite,
  session_ttl_ms: sessionConfig.cookie.maxAge ? sessionConfig.cookie.maxAge : undefined,
  store_encrypted: !!process.env.FILESTORE_ENCRYPTION_KEY
});

// Initialize session middleware first
const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

console.log(`[Server] Session store type: ${typeof sessionStore}`);
console.log(`[Server] Session store has get method: ${typeof sessionStore.get}`);

// Clean up expired sessions on startup
function cleanupExpiredSessions() {
  try {
    logger.info('Starting session cleanup process');

    if (!fs.existsSync(sessionsDir)) {
      logger.debug('Sessions directory does not exist, skipping cleanup');
      return;
    }

    const files = fs.readdirSync(sessionsDir);
    let cleanedCount = 0;
    let totalSize = 0;

    logger.debug(`Found ${files.length} session files to check`);

    files.forEach(file => {
      const filePath = path.join(sessionsDir, file);
      try {
        const stats = fs.statSync(filePath);
        const fileAge = Date.now() - stats.mtime.getTime();
        const fileSize = stats.size;

        // Remove files older than 24 hours
        if (fileAge > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          totalSize += fileSize;

          logger.debug('Removed expired session file', {
            filename: file,
            age_hours: Math.floor(fileAge / (1000 * 60 * 60)),
            size_bytes: fileSize
          });
        }
      } catch (error) {
        logger.warn('Error processing session file', { filename: file, error: error.message });
      }
    });

    if (cleanedCount > 0) {
      logger.info('Session cleanup completed', {
        cleaned_files: cleanedCount,
        freed_space_bytes: totalSize,
        remaining_files: files.length - cleanedCount
      });
    } else {
      logger.debug('No expired sessions found during cleanup');
    }
  } catch (error) {
    logger.error('Error during session cleanup', { error: error.message, stack: error.stack });
  }
}

// Run cleanup on startup
cleanupExpiredSessions();

// Run periodic cleanup every 6 hours
setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000);

// Clean up expired Turnstile tokens from active sessions
function cleanupExpiredTurnstileTokens() {
  try {
    let cleanedCount = 0;
    
    // Iterate through all active WebSocket connections and clean up expired tokens
    wss.clients.forEach((ws) => {
      if (ws._turnstileVerified && ws._turnstileToken) {
        // We can't directly access the session here, but we can mark expired connections
        // The session cleanup will handle removing expired tokens
        ws._turnstileVerified = false;
        ws._turnstileToken = null;
      }
    });
    
    logger.debug('Turnstile token cleanup completed', {
      cleaned_connections: cleanedCount
    });
  } catch (error) {
    logger.error('Error during Turnstile token cleanup', { error: error.message });
  }
}

// Run Turnstile token cleanup every 5 minutes
setInterval(cleanupExpiredTurnstileTokens, 5 * 60 * 1000);

app.use(passport.initialize());
app.use(passport.session());

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Google OAuth routes
app.get('/auth/google',
  // If already authenticated, do not start a new OAuth flow
  (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.redirect('/console?auth=already');
    }
    return next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/console?auth=failure' }),
  (req, res) => {
    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        logger.error('Session regeneration failed during OAuth callback', {
          error: err.message,
          user_email: req.user?.email
        });
        return res.redirect('/console?auth=session_error');
      }
      
      // Re-attach the user to the new session
      req.login(req.user, (loginErr) => {
        if (loginErr) {
          logger.error('Failed to re-attach user to regenerated session', {
            error: loginErr.message,
            user_email: req.user?.email
          });
          return res.redirect('/console?auth=login_error');
        }
        
        logger.info('Session regenerated successfully after OAuth login', {
          user_email: req.user.email,
          user_id: req.user.id
        });
        
        // Successful authentication, redirect to console page with success indicator
        res.redirect('/console?auth=success');
      });
    });
  });

// Logout route
app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/console');
  });
});

// Simple endpoint to report current auth status to frontend
app.get('/auth/status', (req, res) => {
  const isAuth = !!(req.isAuthenticated && req.isAuthenticated());
  const user = isAuth && req.user ? {
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture
  } : null;
  res.json({ authenticated: isAuth, user });
});

// Rate limit all requests (basic protection)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Serve static frontend
const publicDir = path.join(__dirname);
// Serve static files but don't auto-serve index.html so we can inject asset version
app.use(express.static(publicDir, { index: false }));

// Serve xterm libraries from node_modules (with proper MIME types)
app.get('/lib/xterm.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/css/xterm.css'));
});
app.get('/lib/xterm.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/lib/xterm.js'));
});
app.get('/lib/xterm-addon-fit.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'node_modules/@xterm/addon-fit/lib/addon-fit.js'));
});
app.get('/lib/xterm-addon-webgl.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'));
});

// Asset version for cache-busting: use env `ASSET_VERSION`, package.json version, or timestamp
const ASSET_VERSION = process.env.ASSET_VERSION || (() => {
  try { return require(path.join(__dirname, 'package.json')).version || String(Date.now()); } catch (e) { return String(Date.now()); }
})();

function serveConsole(req, res) {
  try {
    const consolePath = path.join(__dirname, 'console.html');
    let html = fs.readFileSync(consolePath, 'utf8');
    html = html.replace(/__ASSET_VERSION__/g, ASSET_VERSION);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    return res.status(500).send('Server error');
  }
}

function serveIndex(req, res) {
  try {
    // Always serve the same HTML - let frontend handle authentication logic
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
app.get('/index.html', serveIndex);
app.get('/console', serveConsole);
app.get('/console.html', serveConsole);

app.get('/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development' }));

// Sitemap endpoint
// Fully Moved to nginx

// Turnstile verification endpoint - accepts a client token and verifies with Cloudflare
app.post('/turnstile-verify', (req, res) => {
  console.log('[Turnstile] Received verification request');
  console.log('[Turnstile] Request headers:', req.headers);
  console.log('[Turnstile] Request body:', req.body);
  const token = (req.body && req.body.token) || '';
  if (!token) return res.status(400).json({ ok: false, message: 'missing token' });
  if (!TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET not configured in environment');
    return res.status(500).json({ ok: false, message: 'server misconfigured: TURNSTILE_SECRET not set' });
  }

  // verify with Cloudflare, with a single retry for transient server errors
  const postData = `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.socket.remoteAddress || '')}`;

  const MAX_RETRIES = parseInt(process.env.TURNSTILE_MAX_RETRIES || '1', 10);
  const TIMEOUT_MS = parseInt(process.env.TURNSTILE_REQUEST_TIMEOUT_MS || '10000', 10);

  const verifyWithCloudflare = (attempt = 0) => new Promise((resolve, reject) => {
    const options = {
      hostname: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'KeySocket-Server/1.0',
        'Accept': 'application/json',
        'Connection': 'close'
      }
    };

    const r2 = https.request(options, (resp) => {
      let data = '';
      let aborted = false;

      resp.on('data', (chunk) => { data += chunk.toString(); });

      resp.on('aborted', () => { aborted = true; });

      resp.on('end', () => {
        if (aborted) return reject(new Error('response aborted'));

        const statusOk = resp.statusCode === 200;
        const contentType = (resp.headers['content-type'] || '') + '';
        const looksJson = /application\/json/.test(contentType.toLowerCase());

        if (!statusOk || !looksJson) {
          // Retry on server errors (5xx)
          if (resp.statusCode >= 500 && attempt < MAX_RETRIES) {
            const backoff = 200 * Math.pow(2, attempt);
            logger.warn('Turnstile provider error, retrying', { status: resp.statusCode, attempt, backoff });
            return setTimeout(() => verifyWithCloudflare(attempt + 1).then(resolve).catch(reject), backoff);
          }
          const err = new Error('turnstile provider error');
          err.status = resp.statusCode;
          err.body = data;
          err.headers = resp.headers;
          return reject(err);
        }

        // Check length mismatch for diagnostics
        const declaredLen = parseInt(resp.headers['content-length'] || '0', 10) || 0;
        if (declaredLen > 0 && declaredLen !== data.length) {
          logger.warn('Turnstile response length mismatch', { declared: declaredLen, received: data.length });
        }

        try {
          const parsed = JSON.parse(data);
          return resolve(parsed);
        } catch (e) {
          const err = new Error('invalid json');
          err.body = data;
          return reject(err);
        }
      });

      resp.on('error', (e) => reject(e));
    });

    r2.on('timeout', () => {
      r2.destroy();
      return reject(new Error('timeout'));
    });

    r2.on('error', (err) => {
      // Network error; retry once for transient errors
      if (attempt < MAX_RETRIES) {
        const backoff = 200 * Math.pow(2, attempt);
        logger.warn('Turnstile request network error, retrying', { error: err.message, attempt, backoff });
        return setTimeout(() => verifyWithCloudflare(attempt + 1).then(resolve).catch(reject), backoff);
      }
      return reject(err);
    });

    r2.setTimeout(TIMEOUT_MS);
    r2.write(postData);
    r2.end();
  });

  verifyWithCloudflare().then((parsed) => {
    if (parsed && parsed.success) {
      if (!req.session) {
        logger.warn('[Turnstile] No session available for token storage');
        return res.status(500).json({ ok: false, message: 'session required' });
      }

      const serverToken = require('crypto').randomBytes(24).toString('hex');
      const expires = Date.now() + TURNSTILE_TOKEN_TTL_MS;

            req.session.turnstileToken = serverToken;
            req.session.turnstileTokenExpires = expires;
            // Store the client's IP as seen by the app (respecting proxy headers)
            try {
              req.session.turnstileVerifiedIP = getReqRemoteIp(req) || '';
            } catch (e) {
              req.session.turnstileVerifiedIP = req.socket.remoteAddress || '';
            }

      const responseData = JSON.stringify({ ok: true, token: serverToken, ttl: TURNSTILE_TOKEN_TTL_MS });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Length', Buffer.byteLength(responseData));
      res.status(200).end(responseData);

      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error('[Turnstile] Failed to save session', saveErr);
        } else {
          logger.info('Turnstile verification successful, token stored in session', {
            user_email: req.session.passport?.user?.email || 'anonymous',
            ip: req.socket.remoteAddress || 'unknown'
          });
        }
      });
    } else {
      logger.warn('[Turnstile] Verification failed', { parsed });
      return res.status(400).json({ ok: false, message: 'verification failed', details: parsed });
    }
  }).catch((err) => {
    logger.error('[Turnstile] Verification request failed', { error: err && err.message, status: err && err.status });
    if (!res.headersSent) {
      if (err && err.status && err.status >= 500) return res.status(502).json({ ok: false, message: 'turnstile provider error' });
      return res.status(500).json({ ok: false, message: 'verification error' });
    }
  });
});

// Trust proxy already configured earlier (BEHIND_PROXY / default true)
// (duplicate removed)

// Create underlying server (HTTPS if TLS available and configured)
let server;
if (USE_TLS && fs.existsSync(TLS_KEY) && fs.existsSync(TLS_CERT)) {
  const key = fs.readFileSync(TLS_KEY);
  const cert = fs.readFileSync(TLS_CERT);
  server = https.createServer({ key, cert }, app);
  logger.info('Starting HTTPS server with TLS certificates');
} else if (USE_TLS) {
  // TLS requested but certificates not found
  if (REQUIRE_TLS) {
    logger.error('TLS required but certificate files not found', {
      tls_key: TLS_KEY,
      tls_cert: TLS_CERT,
      key_exists: fs.existsSync(TLS_KEY),
      cert_exists: fs.existsSync(TLS_CERT)
    });
    console.error('FATAL: REQUIRE_TLS=true but TLS certificates not found. Exiting.');
    process.exit(1);
  } else {
    logger.warn('USE_TLS=true set but certificate files not found; falling back to HTTP', {
      tls_key: TLS_KEY,
      tls_cert: TLS_CERT,
      key_exists: fs.existsSync(TLS_KEY),
      cert_exists: fs.existsSync(TLS_CERT)
    });
    server = http.createServer(app);
  }
} else {
  // HTTP explicitly requested
  if (REQUIRE_TLS) {
    logger.error('REQUIRE_TLS=true but USE_TLS=false. TLS enforcement misconfiguration.');
    console.error('FATAL: REQUIRE_TLS=true but USE_TLS=false. Exiting.');
    process.exit(1);
  } else {
    logger.info('Starting HTTP server (TLS disabled)');
    server = http.createServer(app);
  }
}

// WebSocket server for /ssh with authentication
const wss = new WebSocketServer({ 
  server, 
  path: '/ssh', 
  maxPayload: 2 * 1024 * 1024,
  verifyClient: (info, done) => {
    // Parse and verify session during WebSocket upgrade
    parseWebSocketSession(info.req, async (err, sessionData) => {
      const remoteIp = getReqRemoteIp(info.req);
      if (err || !sessionData || !sessionData.authenticated) {
        logger.warn('WebSocket upgrade rejected: unauthenticated or session error', { ip: remoteIp, err: err ? err.message : undefined });
        done(false, 401, 'Unauthorized: Authentication required');
        return;
      }

      // Check for a server-issued Turnstile token on the upgrade.
      // Support passing it via Sec-WebSocket-Protocol (first value) or Authorization: Bearer <token>
      let tsToken = null;
      try {
        const protoHeader = info.req.headers['sec-websocket-protocol'];
        if (protoHeader) {
          tsToken = protoHeader.split(',')[0].trim();
          if (tsToken && tsToken.startsWith('ts=')) tsToken = tsToken.slice(3);
        }
        if (!tsToken && info.req.headers && info.req.headers.authorization) {
          const m = info.req.headers.authorization.match(/^Bearer\s+(.*)$/i);
          if (m) tsToken = m[1];
        }
      } catch (e) { /* ignore parsing errors */ }

      // If a token is provided, consume and bind it to this session (persisting turnstileVerifiedIP)
      if (tsToken) {
        if (!consumeVerifiedToken(tsToken, remoteIp)) {
          logger.warn('WebSocket upgrade rejected: invalid/expired turnstile token', { ip: remoteIp, user: sessionData.user.email });
          done(false, 401, 'Invalid turnstile token');
          return;
        }

        // Persist binding to session so subsequent upgrades from same session validate
        try {
          const sess = sessionData.session || {};
          sess.turnstileVerifiedIP = remoteIp;
          // write back to session store (best-effort)
          if (sessionData.sessionId && sessionStore && typeof sessionStore.set === 'function') {
            sessionStore.set(sessionData.sessionId, sess, (err) => {
              if (err) logger.warn('Failed to persist turnstileVerifiedIP to session', { session_id: sessionData.sessionId, error: err.message });
            });
          }
        } catch (e) {
          logger.warn('Failed to bind turnstile token to session', { error: e.message });
        }
      } else {
        // No token provided on upgrade — require session to have an IP-bound turnstile verification
        if (!sessionData.turnstileVerifiedIP || sessionData.turnstileVerifiedIP !== remoteIp) {
          logger.warn('WebSocket upgrade rejected: missing or mismatched turnstile binding on session', { ip: remoteIp, session_turnstile_ip: sessionData.turnstileVerifiedIP });
          done(false, 401, 'Turnstile verification required');
          return;
        }
      }

      logger.info('WebSocket upgrade accepted', { ip: remoteIp, user: sessionData.user.email });
      // Store session data on the request for use in connection handler
      info.req.sessionData = sessionData;
      done(true);
    });
  }
});

// Simple per-IP concurrent session limit
const CONCURRENT_PER_IP = parseInt(process.env.CONCURRENT_PER_IP || '5', 10);
const ipSessions = new Map();

// SSH brute-force protection
const MAX_SSH_ATTEMPTS_PER_USER = parseInt(process.env.MAX_SSH_ATTEMPTS_PER_USER || '5', 10);
const sshAttempts = new Map(); // userId -> { count: number, lastAttempt: timestamp }

// Cloudflare Turnstile config
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_TOKEN_TTL_MS = parseInt(process.env.TURNSTILE_TOKEN_TTL_MS || String(30 * 1000), 10);

function incrIp(ip) {
  const n = (ipSessions.get(ip) || 0) + 1;
  ipSessions.set(ip, n);
  return n;
}

function decrIp(ip) {
  const n = Math.max(0, (ipSessions.get(ip) || 1) - 1);
  if (n === 0) ipSessions.delete(ip); else ipSessions.set(ip, n);
  return n;
}

function safeParseJson(message) {
  try { return JSON.parse(message); } catch (e) { return null; }
}

// SSH brute-force protection functions
function checkSshAttempts(userId) {
  const attempts = sshAttempts.get(userId) || { count: 0, lastAttempt: 0 };
  
  // Reset counter if last attempt was more than 15 minutes ago
  const now = Date.now();
  if (now - attempts.lastAttempt > 15 * 60 * 1000) {
    attempts.count = 0;
  }
  
  if (attempts.count >= MAX_SSH_ATTEMPTS_PER_USER) {
    return false; // Block attempt
  }
  
  return true; // Allow attempt
}

function incrementSshAttempts(userId) {
  const attempts = sshAttempts.get(userId) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  sshAttempts.set(userId, attempts);
  
  // Clean up old entries periodically
  if (Math.random() < 0.1) { // 10% chance to clean up
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [uid, data] of sshAttempts.entries()) {
      if (data.lastAttempt < cutoff) {
        sshAttempts.delete(uid);
      }
    }
  }
}

// Comprehensive IP validation function to prevent SSRF attacks
function isPrivateOrLocalIP(input) {
  // Handle various IP encoding formats
  let ip = input;
  
  // Convert decimal IP (e.g., 2130706433) to standard format
  if (/^\d+$/.test(ip)) {
    try {
      const decimal = parseInt(ip, 10);
      if (decimal >= 0 && decimal <= 0xFFFFFFFF) {
        ip = [
          (decimal >>> 24) & 0xFF,
          (decimal >>> 16) & 0xFF,
          (decimal >>> 8) & 0xFF,
          decimal & 0xFF
        ].join('.');
      }
    } catch (e) {
      // Invalid decimal format, treat as suspicious
      return true;
    }
  }
  
  // Convert octal IP (e.g., 0177.0000.0000.0001) to decimal
  if (ip.startsWith('0') && /^[0-7.]+$/.test(ip)) {
    try {
      ip = ip.split('.').map(octet => parseInt(octet, 8)).join('.');
    } catch (e) {
      return true; // Invalid octal format
    }
  }
  
  // Convert hex IP (e.g., 0x7F.0x00.0x00.0x01) to decimal
  if (ip.toLowerCase().includes('0x')) {
    try {
      ip = ip.split('.').map(hexet => {
        if (hexet.startsWith('0x')) {
          return parseInt(hexet, 16);
        }
        return hexet;
      }).join('.');
    } catch (e) {
      return true; // Invalid hex format
    }
  }
  
  // Check for basic localhost variations
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') {
    return true;
  }

  // Check if it's an IP address
  if (net.isIP(ip)) {
    return (
      net.isIPv4(ip) && (
        // IPv4 private ranges
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        (ip.startsWith('172.') && {
          '16': true, '17': true, '18': true, '19': true,
          '20': true, '21': true, '22': true, '23': true,
          '24': true, '25': true, '26': true, '27': true,
          '28': true, '29': true, '30': true, '31': true
        }[ip.split('.')[1]]) ||
        ip.startsWith('169.254.') || // Link-local
        ip.startsWith('127.') || // Loopback
        ip === '0.0.0.0' // Unspecified
      ) ||
      net.isIPv6(ip) && (
        ip.startsWith('fe80::') || // Link-local
        ip.startsWith('fc') || // Private
        ip.startsWith('fd') || // Private
        ip === '::1' || // Loopback
        ip.startsWith('::ffff:127') || // IPv4-mapped localhost
        ip.startsWith('::ffff:192.168.') || // IPv4-mapped private
        ip.startsWith('::ffff:10.') || // IPv4-mapped private
        ip.startsWith('::ffff:172.') || // IPv4-mapped private
        ip === '::' // Unspecified
      )
    );
  }

  return false;
}

// Enhanced host validation with DNS rebinding protection
async function validateHost(hostname, originalHost, sourceIP, userEmail) {
  try {
    // First, check if the hostname itself is suspicious
    if (isPrivateOrLocalIP(hostname)) {
      logger.warn('SSRF attempt blocked - suspicious hostname', {
        original_host: originalHost,
        hostname: hostname,
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw new Error('Access to local/private network denied');
    }
    
    // Tighten hostname blocking with exact patterns
    const blockedPatterns = [
      /^\.?localhost$/,          // localhost or .localhost
      /\.local$/,                 // .local TLD
      /^\.?internal$/,           // internal or .internal
      /^\.?private$/,            // private or .private
      /^169\.254\.169\.254$/,   // AWS/GCP metadata endpoint (exact IP)
      /^\[?fd[0-9a-fA-F:]+\]?$/, // IPv6 ULA (starts with fd)
      /^\[?fc[0-9a-fA-F:]+\]?$/  // IPv6 ULA (starts with fc)
    ];

    // Block known metadata domains (case-insensitive)
    const blockedDomains = [
      'metadata.google.internal',
      'metadata.azure.com',
      'instance-data.ec2.internal',
      'instance-data.amazonaws.com'
    ];

    const lowerHost = hostname.toLowerCase();
    
    // Check blocked patterns (exact or suffix matches)
    if (blockedPatterns.some(pattern => pattern.test(lowerHost))) {
      logger.warn('SSRF attempt blocked - blocked hostname pattern', {
        original_host: originalHost,
        hostname: hostname,
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw new Error('Access to local/private network denied');
    }

    // Check blocked domains (exact or subdomain matches)
    if (blockedDomains.some(domain => 
      lowerHost === domain || lowerHost.endsWith('.' + domain)
    )) {
      logger.warn('SSRF attempt blocked - blocked metadata domain', {
        original_host: originalHost,
        hostname: hostname,
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw new Error('Access to local/private network denied');
    }

    // Check for IP addresses that might have slipped through (e.g., in hostnames)
    const ipMatch = lowerHost.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    if (ipMatch && isPrivateOrLocalIP(ipMatch[0])) {
      logger.warn('SSRF attempt blocked - embedded private IP in hostname', {
        original_host: originalHost,
        hostname: hostname,
        embedded_ip: ipMatch[0],
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw new Error('Access to local/private network denied');
    }
    
    // Enhanced DNS resolution with multiple methods to prevent host file poisoning
    let lookupResults, resolve4Results, resolve6Results;
    
    try {
      // Method 1: Standard lookup (may respect /etc/hosts)
      lookupResults = await dns.lookup(hostname, { all: true });
    } catch (err) {
      logger.debug('DNS lookup failed', { hostname, error: err.message });
    }
    
    try {
      // Method 2: Direct DNS resolution (bypasses /etc/hosts)
      resolve4Results = await dns.resolve4(hostname);
    } catch (err) {
      logger.debug('DNS resolve4 failed', { hostname, error: err.message });
    }
    
    try {
      // Method 3: IPv6 resolution
      resolve6Results = await dns.resolve6(hostname);
    } catch (err) {
      logger.debug('DNS resolve6 failed', { hostname, error: err.message });
    }
    
    // Combine all results from different resolution methods
    const allResults = [];
    
    if (lookupResults && lookupResults.length > 0) {
      allResults.push(...lookupResults.map(r => ({ address: r.address, source: 'lookup' })));
    }
    if (resolve4Results && resolve4Results.length > 0) {
      allResults.push(...resolve4Results.map(addr => ({ address: addr, source: 'resolve4' })));
    }
    if (resolve6Results && resolve6Results.length > 0) {
      allResults.push(...resolve6Results.map(addr => ({ address: addr, source: 'resolve6' })));
    }
    
    if (allResults.length === 0) {
      throw new Error('DNS resolution failed - all methods failed');
    }
    
    // Check for consistency between resolution methods
    const lookupIPs = new Set(lookupResults ? lookupResults.map(r => r.address) : []);
    const directIPs = new Set([...(resolve4Results || []), ...(resolve6Results || [])]);
    
    // If we have both methods and they disagree, that's suspicious
    if (lookupIPs.size > 0 && directIPs.size > 0) {
      const intersection = new Set([...lookupIPs].filter(x => directIPs.has(x)));
      if (intersection.size === 0) {
        logger.warn('DNS resolution inconsistency detected - possible host file poisoning', {
          hostname,
          lookup_ips: Array.from(lookupIPs),
          direct_ips: Array.from(directIPs),
          source_ip: sourceIP,
          user_email: userEmail
        });
        throw new Error('DNS resolution inconsistency detected');
      }
    }
    
    // Check all resolved IP addresses from all methods
    for (const result of allResults) {
      const resolvedIP = result.address;
      
      // Validate each resolved IP - if ANY are private, block the connection
      if (isPrivateOrLocalIP(resolvedIP)) {
        logger.warn('SSRF attempt blocked - DNS resolves to private IP', {
          original_host: originalHost,
          hostname: hostname,
          resolved_ip: resolvedIP,
          resolution_source: result.source,
          source_ip: sourceIP,
          user_email: userEmail
        });
        throw new Error('Access to local/private network denied');
      }
    }
    
    // Return the first IP from lookup results (maintains compatibility)
    return lookupResults && lookupResults.length > 0 ? lookupResults[0].address : allResults[0].address;
  } catch (error) {
    logger.error('Host validation failed', {
      hostname: hostname,
      error: error.message,
      source_ip: sourceIP,
      user_email: userEmail
    });
    throw error;
  }
}

// Each ws connection may bootstrap an SSH client
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const sessionData = req.sessionData; // Session data from verifyClient

  logger.info('New WebSocket connection attempt', {
    ip: ip,
    user_agent: userAgent,
    authenticated: !!(sessionData && sessionData.authenticated),
    user_email: sessionData?.user?.email || 'anonymous'
  });

  if (!sessionData || !sessionData.authenticated) {
    logger.warn('Rejecting unauthenticated WebSocket connection', {
      ip: ip,
      user_agent: userAgent
    });
    ws.close(1008, 'Authentication required');
    return;
  }

  logger.info('WebSocket connection authenticated successfully', {
    ip: ip,
    user_email: sessionData.user.email,
    user_name: sessionData.user.name
  });

  console.log(`[WebSocket] New SSH connection from ${ip} for user ${sessionData.user.email} (${sessionData.user.name})`);

  const concurrent = incrIp(ip);
  if (concurrent > CONCURRENT_PER_IP) {
    ws.send(JSON.stringify({ type: 'error', message: 'Too many concurrent sessions from your IP' }));
    ws.close();
    decrIp(ip);
    return;
  }

  let sshClient = null;
  let sshStream = null;
  let alive = true;
  // attach placeholders to ws so shutdown can access them
  ws._sshClient = null;
  ws._sshStream = null;

  // keepalive
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // messages: first expecting a JSON connect message. After connected, binary messages are sent to ssh.
  // SECURITY FIX: async added to allow await dns.lookup
  ws.on('message', async (msg, isBinary) => {
    if (!alive) return;
    if (!isBinary) {
      const parsed = safeParseJson(msg.toString());
      if (!parsed) return;
      if (parsed.type === 'connect') {
        const { host, port, username, auth, token } = parsed;
        const userId = sessionData.user.id || sessionData.user.email;
        
        // Verify Turnstile token from session
        if (!token) {
          logger.warn('SSH connection blocked - missing Turnstile token', {
            user_email: sessionData.user.email,
            source_ip: ip
          });
          ws.send(JSON.stringify({ type: 'error', message: 'Turnstile token required' }));
          ws.close();
          return;
        }
        
        // Check session for valid Turnstile token
        const session = sessionData.session;
        if (!session || 
            !session.turnstileToken || 
            session.turnstileToken !== token ||
            !session.turnstileTokenExpires ||
            session.turnstileTokenExpires < Date.now()) {
          logger.warn('SSH connection blocked - invalid or expired Turnstile token', {
            user_email: sessionData.user.email,
            source_ip: ip,
            token_present: !!token,
            session_token_present: !!(session && session.turnstileToken),
            token_match: session && session.turnstileToken === token,
            expired: session && session.turnstileTokenExpires < Date.now()
          });
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired Turnstile token' }));
          ws.close();
          return;
        }
        
        // Track this connection's token usage without consuming it immediately
        // This allows multiple WebSocket connections to use the same token
        // Token will expire naturally based on TTL
        ws._turnstileVerified = true;
        ws._turnstileToken = token;
        
        logger.debug('Turnstile token verified for WebSocket connection', {
          user_email: sessionData.user.email,
          source_ip: ip,
          token_expires: new Date(session.turnstileTokenExpires).toISOString()
        });
        
        // Check SSH brute-force protection
        if (!checkSshAttempts(userId)) {
          logger.warn('SSH connection blocked - too many attempts', {
            user_id: userId,
            user_email: sessionData.user.email,
            source_ip: ip,
            max_attempts: MAX_SSH_ATTEMPTS_PER_USER
          });
          ws.send(JSON.stringify({ type: 'error', message: 'Too many failed SSH attempts. Please try again later.' }));
          ws.close();
          return;
        }
        
        // Basic validation
        if (!host || !username) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
          ws.close();
          return;
        }

        // --- ENHANCED SSRF PROTECTION START ---
        // Use comprehensive host validation with DNS rebinding protection
        let targetAddress;
        
        try {
          targetAddress = await validateHost(host, host, ip, sessionData.user.email);
          logger.debug('Host validation passed', {
            original_host: host,
            validated_address: targetAddress
          });
        } catch (error) {
          logger.warn('SSRF protection blocked connection', {
            original_host: host,
            error: error.message,
            source_ip: ip,
            user_email: sessionData.user.email,
            port: port || 22,
            username: username
          });

          ws.send(JSON.stringify({ type: 'error', message: error.message }));
          ws.close();
          return;
        }
        // --- ENHANCED SSRF PROTECTION END ---

        logger.info('SSH connection attempt', {
          target_host: host,
          target_ip: targetAddress, // Log the actual IP
          target_port: port || 22,
          username: username,
          auth_type: auth,
          source_ip: ip,
          user_email: sessionData.user.email
        });

        // Create ssh client
        sshClient = new Client();
        ws._sshClient = sshClient;
        const connectionStartTime = Date.now();
        const connectOpts = {
          host: targetAddress, // 3. IMPORTANT: Connect to the VALIDATED IP, not the hostname
          port: parseInt(port || '22', 10),
          username: username,
          readyTimeout: 20000,
          algorithms: { // keep defaults but allow modern servers
          }
        };
        if (auth === 'password') connectOpts.password = parsed.password;
        else if (auth === 'key') connectOpts.privateKey = parsed.privateKey || parsed.key;
        if (parsed.passphrase) connectOpts.passphrase = parsed.passphrase;

        // Optional: restrict destinations in production via env (should be IPs/CIDRs)
        const allowed = process.env.ALLOWED_HOSTS; // comma separated IPs or CIDRs
        if (allowed) {
          const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
          if (!list.includes(targetAddress)) {
            logger.warn('SSH connection blocked - destination not in allowed list', {
              original_host: host,
              target_ip: targetAddress,
              allowed_list: list,
              source_ip: ip,
              user_email: sessionData.user.email
            });
            ws.send(JSON.stringify({ type: 'error', message: 'Destination not allowed' }));
            ws.close();
            return;
          }
        }

        sshClient.on('ready', () => {
          ws.send(JSON.stringify({ type: 'ready' }));
          sshClient.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to start shell' }));
              ws.close();
              sshClient.end();
              return;
            }
            sshStream = stream;
            ws._sshStream = stream;
            stream.on('data', (data) => {
              // send raw binary data back to client
              try { ws.send(data); } catch (e) {}
            });
            stream.on('close', () => {
              try { ws.send(JSON.stringify({ type: 'ssh-closed' })); } catch (e) {}
              ws.close();
            });
          });
        });

        sshClient.on('error', (err) => {
          // Increment brute-force counter on connection error
          incrementSshAttempts(userId);
          
          logger.error('SSH connection error', {
            target_host: host,
            target_port: port || 22,
            username: username,
            source_ip: ip,
            user_email: sessionData.user.email,
            user_id: userId,
            error: err.message,
            error_code: err.code,
            connection_time_ms: Date.now() - connectionStartTime
          });

          ws.send(JSON.stringify({ type: 'error', message: err.message }));
          ws.close();
        });

        sshClient.on('end', () => {
          logger.info('SSH connection ended', {
            target_host: host,
            target_port: port || 22,
            username: username,
            source_ip: ip,
            user_email: sessionData.user.email
          });
        });

        sshClient.on('close', () => {
          logger.info('SSH connection closed', {
            target_host: host,
            target_port: port || 22,
            username: username,
            source_ip: ip,
            user_email: sessionData.user.email
          });
        });

        sshClient.connect(connectOpts);
      } else if (parsed.type === 'resize') {
        const cols = parseInt(parsed.cols || '80', 10);
        const rows = parseInt(parsed.rows || '24', 10);
        if (sshStream && sshStream.setWindow) sshStream.setWindow(rows, cols, rows * 8, cols * 8);
      }
      return;
    }

    // binary message -> forward to ssh input
    if (sshStream) {
      try { 
        sshStream.write(msg); 
      } catch (e) {
        logger.warn('SSH stream write failed', {
          error: e.message,
          source_ip: ip,
          user_email: sessionData.user.email,
          message_size: msg.length
        });
      }
    }
  });

  ws.on('close', () => {
    alive = false;
    if (sshClient) try { sshClient.end(); } catch (e) {}
    decrIp(ip);
  });

  ws.on('error', () => { ws.terminate(); });
});

// ping clients periodically
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

server.listen(PORT, HOST, () => {
  logger.info('=== KeySocket Server Started Successfully ===', {
    host: HOST,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
    node_version: process.version,
    session_store_type: 'FileStore',
    websocket_path: '/ssh',
    ssrf_protection: 'enabled (DNS Resolution + IP Validation)',
    session_cleanup: 'enabled (24h TTL)',
    log_level: logLevel
  });

  console.log(`\n🚀 KeySocket Server listening on ${HOST}:${PORT}`);
  console.log(`📝 Logs: ${logFile}`);
  console.log(`🔐 Authentication: Google OAuth + Turnstile`);
  console.log(`🛡️  SSRF Protection: Enabled (DNS Resolution + IP Validation)`);
  console.log(`💾 Session Storage: FileStore (${sessionsDir})`);
  console.log(`🗑️  Session Cleanup: Every 6 hours (24h TTL)\n`);
});

// graceful shutdown: close websockets, end SSH clients, then close HTTP server
function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  try {
    // stop accepting new connections
    server.close(() => { 
      logger.info('HTTP server closed'); 
    });
  } catch (e) { 
    logger.warn('error closing server', { error: e.message }); 
  }

  try {
    // close websocket server and all clients with proper shutdown code
    const clientCount = wss.clients.size;
    logger.info('Closing WebSocket clients', { client_count: clientCount });
    
    wss.clients.forEach((ws) => {
      try {
        // First close SSH connections cleanly
        if (ws._sshStream && typeof ws._sshStream.end === 'function') {
          try { 
            ws._sshStream.end(); 
            logger.debug('SSH stream ended for client');
          } catch (e) { 
            logger.debug('Error ending SSH stream', { error: e.message }); 
          }
        }
        if (ws._sshClient && typeof ws._sshClient.end === 'function') {
          try { 
            ws._sshClient.end(); 
            logger.debug('SSH client ended for client');
          } catch (e) { 
            logger.debug('Error ending SSH client', { error: e.message }); 
          }
        }
        
        // Close WebSocket with proper shutdown code
        try { 
          ws.close(1001, 'Server shutdown'); 
          logger.debug('WebSocket closed with code 1001');
        } catch (e) { 
          logger.debug('Error closing WebSocket, trying terminate', { error: e.message });
          try { ws.terminate(); } catch (e2) { 
            logger.debug('Error terminating WebSocket', { error: e2.message }); 
          }
        }
      } catch (e) { 
        logger.debug('Error during client shutdown', { error: e.message }); 
      }
    });
    
    // Close the WebSocket server itself
    try { 
      wss.close(() => { 
        logger.info('WebSocket server closed'); 
      }); 
    } catch (e) { 
      logger.warn('error closing wss', { error: e.message }); 
    }
  } catch (e) { 
    logger.warn('error during websocket shutdown', { error: e.message }); 
  }

  // give a short grace period then exit
  setTimeout(() => {
    logger.info('Shutdown complete, exiting');
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));