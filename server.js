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
  contentSecurityPolicy: false, // Disabled: We handle CSP in Nginx
  crossOriginResourcePolicy: false
}));

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));

// Session parser for WebSocket connections
function parseWebSocketSession(cookieHeader, callback) {
  if (!cookieHeader) {
    logger.debug('WebSocket connection without cookie header', { ip: 'unknown' });
    return callback(null, null);
  }

  // Check if sessionStore is available
  if (!sessionStore) {
    logger.error('Session store not available for WebSocket authentication');
    return callback(null, null);
  }

  try {
    const cookies = cookie.parse(cookieHeader);
    const sessionId = cookies['connect.sid'];

    logger.debug('WebSocket session authentication attempt', {
      session_id: sessionId ? sessionId.substring(0, 20) + '...' : 'null',
      cookie_present: !!sessionId
    });

    if (!sessionId) {
      logger.debug('No connect.sid found in WebSocket cookies');
      return callback(null, null);
    }

    // Remove the 's:' prefix and decode if necessary
    let cleanSessionId = sessionId;
    if (sessionId.startsWith('s:')) {
      cleanSessionId = sessionId.slice(2).split('.')[0];
    }

    logger.debug('Processing WebSocket session', {
      original_id: sessionId.substring(0, 20) + '...',
      clean_id: cleanSessionId,
      store_type: typeof sessionStore,
      has_get_method: typeof sessionStore.get
    });

    // Get session from store
    sessionStore.get(cleanSessionId, (err, session) => {
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

      // Check if user is authenticated via Passport
      if (session.passport && session.passport.user) {
        logger.info('WebSocket user authenticated successfully', {
          session_id: cleanSessionId,
          user_email: session.passport.user.email,
          user_name: session.passport.user.name
        });

        return callback(null, {
          authenticated: true,
          user: session.passport.user
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
  reapInterval: 3600000 // Clean up expired sessions every hour (in milliseconds)
});

const sessionConfig = {
  store: sessionStore,
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
// Fully Moved to nginx

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

// IP validation function to prevent SSRF attacks
function isPrivateOrLocalIP(host) {
  // Check for localhost variations
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  // Check if it's an IP address
  if (net.isIP(host)) {
    return net.isIP(host) && (
      net.isIPv4(host) && (
        // IPv4 private ranges
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        (host.startsWith('172.') && {
          '16': true, '17': true, '18': true, '19': true,
          '20': true, '21': true, '22': true, '23': true,
          '24': true, '25': true, '26': true, '27': true,
          '28': true, '29': true, '30': true, '31': true
        }[host.split('.')[1]]) ||
        host.startsWith('169.254.') || // Link-local
        host.startsWith('127.') // Loopback
      ) ||
      net.isIPv6(host) && (
        host.startsWith('fe80::') || // Link-local
        host.startsWith('fc') || // Private
        host.startsWith('fd') || // Private
        host.startsWith('::1') || // Loopback
        host.startsWith('::ffff:127') // IPv4-mapped localhost
      )
    );
  }

  // For domain names, we could do DNS resolution here
  // For now, we'll block suspicious domain patterns
  const suspiciousPatterns = [
    'localhost',
    'local',
    'internal',
    'admin',
    'management',
    'gateway',
    'router',
    'switch',
    'firewall'
  ];

  return suspiciousPatterns.some(pattern => host.toLowerCase().includes(pattern));
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
        const { host, port, username, auth } = parsed;
        // Basic validation
        if (!host || !username) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
          ws.close();
          return;
        }

        // --- SECURITY FIX: SSRF PROTECTION START ---
        // Resolve hostname to IP first, then validate the IP, then connect to the IP.
        // This prevents DNS Rebinding attacks (Time-of-Check Time-of-Use).
        
        let targetAddress = host;
        
        // 1. If it looks like a domain, resolve it to an IP first
        if (!net.isIP(host)) {
            try {
                logger.debug('Resolving DNS for host', { host });
                const result = await dns.lookup(host);
                targetAddress = result.address;
                logger.debug('DNS resolved', { host, address: targetAddress });
            } catch (err) {
                logger.warn('DNS resolution failed', { host, error: err.message });
                ws.send(JSON.stringify({ type: 'error', message: 'DNS resolution failed' }));
                ws.close();
                return;
            }
        }

        // 2. Validate the RESOLVED IP, not the hostname
        if (isPrivateOrLocalIP(targetAddress)) {
          logger.warn('SSRF attempt blocked - private/local network access denied', {
            original_host: host,
            resolved_ip: targetAddress, 
            source_ip: ip,
            user_email: sessionData.user.email,
            user_agent: req.headers['user-agent'] || 'unknown',
            port: port || 22,
            username: username
          });

          ws.send(JSON.stringify({ type: 'error', message: 'Access to local/private network denied' }));
          ws.close();
          return;
        }
        // --- SECURITY FIX: SSRF PROTECTION END ---

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
          logger.error('SSH connection error', {
            target_host: host,
            target_port: port || 22,
            username: username,
            source_ip: ip,
            user_email: sessionData.user.email,
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
