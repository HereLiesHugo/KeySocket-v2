require('dotenv').config();
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

// Create a write stream for logging
const logStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });

// Override console.log to also write to file
const originalConsoleLog = console.log;
console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  logStream.write(new Date().toISOString() + ' - ' + args.join(' ') + '\n');
};

const originalConsoleError = console.error;
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  logStream.write(new Date().toISOString() + ' - ERROR: ' + args.join(' ') + '\n');
};

const app = express();

// ensure secure cookies (sessions) work when behind a proxy/CDN like Cloudflare
app.set('trust proxy', 1);

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
const TLS_KEY = process.env.TLS_KEY || '/etc/letsencrypt/live/keysocket.eu/privkey.pem';
const TLS_CERT = process.env.TLS_CERT || '/etc/letsencrypt/live/keysocket.eu/fullchain.pem';

// Basic security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // allow Cloudflare Turnstile, jsDelivr CDN, and Google Fonts
      scriptSrc: ["'self'", "https://challenges.cloudflare.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["https://challenges.cloudflare.com"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
    }
  },
  crossOriginResourcePolicy: false  // allow CORS requests to CDN resources
}));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));

// Session store reference for WebSocket authentication
let sessionStore;

// Session parser for WebSocket connections
function parseWebSocketSession(cookieHeader, callback) {
  const logFile = path.join(__dirname, 'server.log');
  const logMessage = (msg) => {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${msg}\n`;
    fs.appendFileSync(logFile, logEntry);
    console.log(msg);
  };
  
  if (!cookieHeader) {
    logMessage(`[WebSocket] No cookie header provided`);
    return callback(null, null);
  }
  
  // Check if sessionStore is available
  if (!sessionStore) {
    logMessage(`[WebSocket] Session store not available`);
    return callback(null, null);
  }
  
  try {
    const cookies = cookie.parse(cookieHeader);
    const sessionId = cookies['connect.sid'];
    
    logMessage(`[WebSocket] Session ID from cookie: ${sessionId ? sessionId.substring(0, 20) + '...' : 'null'}`);
    
    if (!sessionId) {
      logMessage(`[WebSocket] No connect.sid found in cookies`);
      return callback(null, null);
    }
    
    // Remove the 's:' prefix and decode if necessary
    let cleanSessionId = sessionId;
    if (sessionId.startsWith('s:')) {
      cleanSessionId = sessionId.slice(2).split('.')[0];
    }
    
    logMessage(`[WebSocket] Clean session ID: ${cleanSessionId}`);
    logMessage(`[WebSocket] Session store type: ${typeof sessionStore}`);
    logMessage(`[WebSocket] Session store has get method: ${typeof sessionStore.get}`);
    
    // Get session from store
    sessionStore.get(cleanSessionId, (err, session) => {
      if (err) {
        logMessage(`[WebSocket] Error getting session: ${err.message}`);
        return callback(err, null);
      }
      
      if (!session) {
        logMessage(`[WebSocket] No session found for ID: ${cleanSessionId}`);
        return callback(null, null);
      }
      
      logMessage(`[WebSocket] Session found, checking authentication...`);
      
      // Check if user is authenticated via Passport
      if (session.passport && session.passport.user) {
        logMessage(`[WebSocket] User authenticated: ${session.passport.user.email}`);
        return callback(null, {
          authenticated: true,
          user: session.passport.user
        });
      }
      
      logMessage(`[WebSocket] Session found but user not authenticated`);
      return callback(null, null);
    });
  } catch (error) {
    logMessage(`[WebSocket] Exception parsing session: ${error.message}`);
    logMessage(`[WebSocket] Stack: ${error.stack}`);
    callback(null, null);
  }
}

// Session configuration (reusable for Express and WebSocket)
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS attacks
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Allow cross-origin requests
  }
};

// Initialize session middleware first
const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

// Store session store reference for WebSocket authentication
sessionStore = sessionMiddleware.store;
console.log(`[Server] Session store type: ${typeof sessionStore}`);
console.log(`[Server] Session store has get method: ${typeof sessionStore.get}`);

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
    // Successful authentication, redirect to console page with success indicator
    res.redirect('/console?auth=success');
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
app.get('/sitemap.xml', (req, res) => {
  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  
  // Set headers first
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  if (fs.existsSync(sitemapPath)) {
    try {
      const xmlContent = fs.readFileSync(sitemapPath, 'utf8');
      return res.status(200).send(xmlContent);
    } catch (e) {
      console.error('Error reading sitemap:', e);
    }
  }
  
  // Fallback if file doesn't exist or can't be read
  const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://keysocket.eu/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  res.status(200).send(fallback);
});

// Robots.txt endpoint
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const robotsPath = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    return res.sendFile(robotsPath);
  }
  // Fallback if file doesn't exist
  res.send(`User-agent: *
Disallow: /private/
Disallow: /admin/
Disallow: /api/
Disallow: /socket.io/
Disallow: /*.json$
Disallow: /*?*$
Crawl-delay: 1

Allow: /

Sitemap: https://keysocket.eu/sitemap.xml`);
});

// Turnstile verification endpoint - accepts a client token and verifies with Cloudflare
app.post('/turnstile-verify', (req, res) => {
  const token = (req.body && req.body.token) || '';
  if (!token) return res.status(400).json({ ok: false, message: 'missing token' });
  if (!TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET not configured in environment');
    return res.status(500).json({ ok: false, message: 'server misconfigured: TURNSTILE_SECRET not set' });
  }

  // verify with Cloudflare
  const postData = `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.socket.remoteAddress || '')}`;
  const options = {
    hostname: 'challenges.cloudflare.com',
    path: '/turnstile/v0/siteverify',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
  };

  console.log(`[Turnstile] Verifying token for IP ${req.socket.remoteAddress || 'unknown'}`);
  const req2 = https.request(options, (resp) => {
    let data = '';
    resp.on('data', (chunk) => { data += chunk.toString(); });
    resp.on('end', () => {
      try {
          const parsed = JSON.parse(data);
          console.log(`[Turnstile] Cloudflare response: success=${parsed.success}, error-codes=${JSON.stringify(parsed['error-codes'] || [])}`);
          if (parsed && parsed.success) {
            // generate a server-side one-time token and store that (do NOT return the Cloudflare token)
            const serverToken = require('crypto').randomBytes(24).toString('hex');
            storeVerifiedToken(serverToken, req.socket.remoteAddress || '');
            console.log(`[Turnstile] Verification successful, issued server token`);
            return res.json({ ok: true, token: serverToken, ttl: TURNSTILE_TOKEN_TTL_MS });
          }
          console.warn(`[Turnstile] Verification failed: ${JSON.stringify(parsed)}`);
          return res.status(400).json({ ok: false, message: 'verification failed', details: parsed });
      } catch (e) {
        console.error(`[Turnstile] Failed to parse Cloudflare response: ${e.message}`);
        return res.status(500).json({ ok: false, message: 'invalid response from turnstile' });
      }
    });
  });

  req2.on('error', (err) => { 
    console.error('[Turnstile] Request error:', err.message); 
    res.status(500).json({ ok: false, message: 'verification error' }); 
  });
  req2.write(postData);
  req2.end();
});

// Create underlying server (HTTPS if TLS available and configured)
let server;
if (USE_TLS && fs.existsSync(TLS_KEY) && fs.existsSync(TLS_CERT)) {
  const key = fs.readFileSync(TLS_KEY);
  const cert = fs.readFileSync(TLS_CERT);
  server = https.createServer({ key, cert }, app);
  console.log('Starting HTTPS server');
} else {
  server = http.createServer(app);
  if (USE_TLS) console.warn('USE_TLS=true set but certificate files not found; starting HTTP instead');
}

// WebSocket server for /ssh with authentication
const wss = new WebSocketServer({ 
  server, 
  path: '/ssh', 
  maxPayload: 2 * 1024 * 1024,
  verifyClient: (info, done) => {
    // Parse and verify session during WebSocket upgrade
    parseWebSocketSession(info.req.headers.cookie, (err, sessionData) => {
      if (err || !sessionData || !sessionData.authenticated) {
        console.log(`[WebSocket] Rejected connection from ${info.req.socket.remoteAddress}: Not authenticated`);
        done(false, 401, 'Unauthorized: Authentication required');
        return;
      }
      
      console.log(`[WebSocket] Accepted connection from ${info.req.socket.remoteAddress} for user ${sessionData.user.email}`);
      // Store session data on the request for use in connection handler
      info.req.sessionData = sessionData;
      done(true);
    });
  }
});

// Simple per-IP concurrent session limit
const CONCURRENT_PER_IP = parseInt(process.env.CONCURRENT_PER_IP || '5', 10);
const ipSessions = new Map();

// Cloudflare Turnstile config
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_TOKEN_TTL_MS = parseInt(process.env.TURNSTILE_TOKEN_TTL_MS || String(30 * 1000), 10);

// one-time verified tokens (keyed by the turnstile response token)
const verifiedTokens = new Map(); // token -> { ip, expires }

function storeVerifiedToken(token, ip) {
  const expires = Date.now() + TURNSTILE_TOKEN_TTL_MS;
  verifiedTokens.set(token, { ip, expires });
}

function consumeVerifiedToken(token, ip) {
  const info = verifiedTokens.get(token);
  if (!info) return false;
  // If stored with an IP, ensure match (optional)
  if (info.ip && ip && info.ip !== ip) return false;
  if (info.expires < Date.now()) { verifiedTokens.delete(token); return false; }
  verifiedTokens.delete(token);
  return true;
}

// cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [t, info] of verifiedTokens.entries()) if (info.expires < now) verifiedTokens.delete(t);
}, 5000);

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

// Each ws connection may bootstrap an SSH client
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const sessionData = req.sessionData; // Session data from verifyClient
  
  if (!sessionData || !sessionData.authenticated) {
    console.log(`[WebSocket] Unexpected unauthenticated connection from ${ip}`);
    ws.close(1008, 'Authentication required');
    return;
  }
  
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
  ws.on('message', (msg, isBinary) => {
    if (!alive) return;
    if (!isBinary) {
      const parsed = safeParseJson(msg.toString());
      if (!parsed) return;
      if (parsed.type === 'connect') {
        const { host, port, username, auth } = parsed;
        // Basic validation
        if (!host || !username) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
          ws.close();
          return;
        }

        // Create ssh client
        sshClient = new Client();
        ws._sshClient = sshClient;
        const connectOpts = {
          host: host,
          port: parseInt(port || '22', 10),
          username: username,
          readyTimeout: 20000,
          algorithms: { // keep defaults but allow modern servers
          }
        };
        if (auth === 'password') connectOpts.password = parsed.password;
        else if (auth === 'key') connectOpts.privateKey = parsed.privateKey || parsed.key;
        if (parsed.passphrase) connectOpts.passphrase = parsed.passphrase;

        // Optional: restrict destinations in production via env
        const allowed = process.env.ALLOWED_HOSTS; // comma separated
        if (allowed) {
          const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
          if (!list.includes(host)) {
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
          try { ws.send(JSON.stringify({ type: 'error', message: 'SSH error: ' + String(err.message) })); } catch (e) {}
          ws.close();
        });

        sshClient.on('end', () => {});

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
      try { sshStream.write(msg); } catch (e) {}
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
  console.log(`Server listening on ${HOST}:${PORT} (ENV=${process.env.NODE_ENV || 'development'})`);
});

// graceful shutdown: close websockets, end SSH clients, then close HTTP server
function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  try {
    // stop accepting new connections
    server.close(() => { console.log('HTTP server closed'); });
  } catch (e) { console.warn('error closing server', e); }

  try {
    // close websocket server and all clients
    wss.clients.forEach((ws) => {
      try {
        if (ws._sshStream && typeof ws._sshStream.end === 'function') {
          try { ws._sshStream.end(); } catch (e) {}
        }
        if (ws._sshClient && typeof ws._sshClient.end === 'function') {
          try { ws._sshClient.end(); } catch (e) {}
        }
        try { ws.close(); } catch (e) { try { ws.terminate(); } catch (e2) {} }
      } catch (e) { /* ignore per-client errors */ }
    });
    try { wss.close(() => { console.log('WebSocket server closed'); }); } catch (e) { console.warn('error closing wss', e); }
  } catch (e) { console.warn('error during websocket shutdown', e); }

  // give a short grace period then exit
  setTimeout(() => {
    console.log('Shutdown complete, exiting');
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
