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

const app = express();

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
      scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
      frameSrc: ["https://challenges.cloudflare.com"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    }
  }
}));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

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
app.use(express.static(publicDir));

app.get('/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development' }));

// Turnstile verification endpoint - accepts a client token and verifies with Cloudflare
app.post('/turnstile-verify', (req, res) => {
  const token = (req.body && req.body.token) || '';
  if (!token) return res.status(400).json({ ok: false, message: 'missing token' });
  if (!TURNSTILE_SECRET) return res.status(500).json({ ok: false, message: 'server misconfigured: TURNSTILE_SECRET not set' });

  // verify with Cloudflare
  const postData = `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.socket.remoteAddress || '')}`;
  const options = {
    hostname: 'challenges.cloudflare.com',
    path: '/turnstile/v0/siteverify',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
  };

  const req2 = https.request(options, (resp) => {
    let data = '';
    resp.on('data', (chunk) => { data += chunk.toString(); });
    resp.on('end', () => {
      try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.success) {
            // generate a server-side one-time token and store that (do NOT return the Cloudflare token)
            const serverToken = require('crypto').randomBytes(24).toString('hex');
            storeVerifiedToken(serverToken, req.socket.remoteAddress || '');
            return res.json({ ok: true, token: serverToken, ttl: TURNSTILE_TOKEN_TTL_MS });
          }
          return res.status(400).json({ ok: false, message: 'verification failed', details: parsed });
      } catch (e) {
        return res.status(500).json({ ok: false, message: 'invalid response from turnstile' });
      }
    });
  });

  req2.on('error', (err) => { console.error('turnstile verify error', err); res.status(500).json({ ok: false, message: 'verification error' }); });
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

// WebSocket server for /ssh
const wss = new WebSocketServer({ server, path: '/ssh', maxPayload: 2 * 1024 * 1024 });

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
  // require a one-time Turnstile token passed as query param `ts`
  try {
    const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const ts = fullUrl.searchParams.get('ts');
    if (!ts || !consumeVerifiedToken(ts, ip)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Turnstile verification required' }));
      ws.close();
      return;
    }
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid connection parameters' }));
    ws.close();
    return;
  }
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
