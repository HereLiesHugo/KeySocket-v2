/**
 * WebSocket handler module
 * Manages WebSocket connections and SSH client handling
 */

const { Client } = require('ssh2');
const { WebSocketServer } = require('ws');
const { logger } = require('./logging');
const { validateHost } = require('./validation');
const { parseWebSocketSession, getReqRemoteIp, sessionStore } = require('./session');
const config = require('./config');

// Per-IP concurrent session tracking
const ipSessions = new Map();

// SSH brute-force protection
const sshAttempts = new Map();

// Turnstile token tracking for WebSocket upgrades
const verifiedTokens = new Map();

/**
 * Increment concurrent sessions for an IP
 * @param {string} ip - IP address
 * @returns {number} New concurrent session count
 */
function incrIp(ip) {
  const n = (ipSessions.get(ip) || 0) + 1;
  ipSessions.set(ip, n);
  return n;
}

/**
 * Decrement concurrent sessions for an IP
 * @param {string} ip - IP address
 * @returns {number} New concurrent session count
 */
function decrIp(ip) {
  const n = Math.max(0, (ipSessions.get(ip) || 1) - 1);
  if (n === 0) ipSessions.delete(ip);
  else ipSessions.set(ip, n);
  return n;
}

/**
 * Safely parse JSON message
 * @param {string|Buffer} message - Message to parse
 * @returns {Object|null} Parsed object or null
 */
function safeParseJson(message) {
  try {
    return JSON.parse(message);
  } catch (error) {
    logger.debug('Failed to parse JSON message', { error: error.message });
    return null;
  }
}

/**
 * Check if user has remaining SSH connection attempts
 * @param {string} userId - User ID or email
 * @returns {boolean} True if under limit
 */
function checkSshAttempts(userId) {
  const attempts = sshAttempts.get(userId) || { count: 0, lastAttempt: 0 };

  // Reset counter if last attempt was more than 15 minutes ago
  const now = Date.now();
  if (now - attempts.lastAttempt > 15 * 60 * 1000) {
    attempts.count = 0;
  }

  return attempts.count < config.MAX_SSH_ATTEMPTS_PER_USER;
}

/**
 * Increment SSH connection attempts for a user
 * @param {string} userId - User ID or email
 */
function incrementSshAttempts(userId) {
  const attempts = sshAttempts.get(userId) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  sshAttempts.set(userId, attempts);

  // Clean up old entries periodically (10% chance)
  if (Math.random() < 0.1) {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [uid, data] of sshAttempts.entries()) {
      if (data.lastAttempt < cutoff) {
        sshAttempts.delete(uid);
      }
    }
  }
}

/**
 * Store a Turnstile token for WebSocket upgrade verification
 * @param {string} token - Token to store
 * @param {string} ip - IP address associated with token
 */
function storeVerifiedToken(token, ip) {
  verifiedTokens.set(token, {
    ip: ip,
    timestamp: Date.now(),
    expires: Date.now() + config.TURNSTILE_TOKEN_TTL_MS
  });
}

/**
 * Consume and validate a Turnstile token on WebSocket upgrade
 * @param {string} token - Token to validate
 * @param {string} ip - Current IP address
 * @returns {boolean} True if token is valid for this IP
 */
function consumeVerifiedToken(token, ip) {
  const record = verifiedTokens.get(token);
  if (!record) {
    logger.debug('Turnstile token not found', { ip });
    return false;
  }

  if (record.expires < Date.now()) {
    logger.debug('Turnstile token expired', { ip, expires: new Date(record.expires) });
    verifiedTokens.delete(token);
    return false;
  }

  if (record.ip !== ip) {
    logger.warn('Turnstile token IP mismatch', {
      token_ip: record.ip,
      current_ip: ip
    });
    return false;
  }

  // Token is valid but don't consume it yet (allow multiple WebSocket connections)
  return true;
}

/**
 * Clean up expired Turnstile tokens
 * @param {Object} wsClients - WebSocket clients collection
 */
function cleanupExpiredTurnstileTokens(wsClients) {
  try {
    let cleanedCount = 0;

    // Clean up expired tokens from the tracking map
    const now = Date.now();
    for (const [token, record] of verifiedTokens.entries()) {
      if (record.expires < now) {
        verifiedTokens.delete(token);
        cleanedCount++;
      }
    }

    // Also check session-bound tokens on WebSocket connections
    wsClients.forEach((ws) => {
      if (ws._sessionData?.turnstileTokenExpires && ws._sessionData.turnstileTokenExpires < now) {
        logger.debug('Expired turnstile token found on WebSocket connection');
      }
    });

    if (cleanedCount > 0) {
      logger.debug('Turnstile token cleanup completed', { cleaned_tokens: cleanedCount });
    }
  } catch (error) {
    logger.error('Error during Turnstile token cleanup', { error: error.message });
  }
}

/**
 * Handle SSH connection message from WebSocket
 * @param {Object} ws - WebSocket instance
 * @param {Object} sessionData - Session data
 * @param {Object} parsed - Parsed message from client
 * @param {string} ip - Client IP address
 */
async function handleSshConnect(ws, sessionData, parsed, ip) {
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
  const session = sessionData.session || {};
  if (!session?.turnstileToken ||
    session.turnstileToken !== token ||
    !session.turnstileTokenExpires ||
    session.turnstileTokenExpires < Date.now()) {
    logger.warn('SSH connection blocked - invalid or expired Turnstile token', {
      user_email: sessionData.user.email,
      source_ip: ip,
      token_present: !!token,
      session_token_present: !!session?.turnstileToken,
      token_match: session?.turnstileToken === token,
      expired: session && session.turnstileTokenExpires < Date.now()
    });
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired Turnstile token' }));
    ws.close();
    return;
  }

  // Track this connection's token usage
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
      max_attempts: config.MAX_SSH_ATTEMPTS_PER_USER
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

  // SSRF Protection: Validate host and resolve to IP
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

  logger.info('SSH connection attempt', {
    target_host: host,
    target_ip: targetAddress,
    target_port: port || 22,
    username: username,
    auth_type: auth,
    source_ip: ip,
    user_email: sessionData.user.email
  });

  // Check allowed hosts list (if configured)
  const allowedHosts = process.env.ALLOWED_HOSTS;
  if (allowedHosts) {
    const list = allowedHosts.split(',').map(s => s.trim()).filter(Boolean);
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

  // Create SSH client
  const sshClient = new Client();
  ws._sshClient = sshClient;
  const connectionStartTime = Date.now();

  const connectOpts = {
    host: targetAddress,
    port: Number.parseInt(port || '22', 10),
    username: username,
    readyTimeout: 20000
  };

  if (auth === 'password') connectOpts.password = parsed.password;
  else if (auth === 'key') connectOpts.privateKey = parsed.privateKey || parsed.key;
  if (parsed.passphrase) connectOpts.passphrase = parsed.passphrase;

  sshClient.on('ready', () => {
    ws.send(JSON.stringify({ type: 'ready' }));
    sshClient.shell(
      { term: 'xterm-color', cols: 80, rows: 24 },
      (err, stream) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to start shell' }));
          ws.close();
          sshClient.end();
          return;
        }

        ws._sshStream = stream;

        stream.on('data', (data) => {
          try {
            ws.send(data);
          } catch (error) {
            logger.debug('Failed to send SSH data to WebSocket', { error: error.message });
          }
        });

        stream.on('close', () => {
          try {
            ws.send(JSON.stringify({ type: 'ssh-closed' }));
          } catch (error) {
            logger.debug('Failed to send SSH close message', { error: error.message });
          }
          ws.close();
        });
      }
    );
  });

  sshClient.on('error', (err) => {
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
}

/**
 * Create and configure WebSocket server
 * @param {Object} server - HTTP/HTTPS server instance
 * @returns {Object} Configured WebSocketServer
 */
function createWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ssh',
    maxPayload: 2 * 1024 * 1024,
    verifyClient: (info, done) => {
      // Parse and verify session during WebSocket upgrade
      parseWebSocketSession(info.req, async (err, sessionData) => {
        const remoteIp = getReqRemoteIp(info.req);

        if (err || !sessionData?.authenticated) {
          logger.warn('WebSocket upgrade rejected: authentication failed', {
            ip: remoteIp,
            error: err?.message
          });
          done(false, 401, 'Authentication failed');
          return;
        }

        // Extract and validate Turnstile token
        const tsToken = extractTurnstileToken(info.req);
        if (!handleTurnstileValidation(tsToken, remoteIp, sessionData, done)) {
          return;
        } else if (sessionData.turnstileVerifiedIP !== remoteIp) {
          logger.warn('WebSocket upgrade rejected: missing or mismatched turnstile binding', {
            ip: remoteIp,
            session_turnstile_ip: sessionData.turnstileVerifiedIP
          });
          done(false, 401, 'Turnstile verification required');
          return;
        }

        logger.info('WebSocket upgrade accepted', {
          ip: remoteIp,
          user: sessionData.user.email
        });

        info.req.sessionData = sessionData;
        done(true);
      });
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const sessionData = req.sessionData;

    logger.info('New WebSocket connection attempt', {
      ip: ip,
      user_agent: userAgent,
      authenticated: !!sessionData?.authenticated,
      user_email: sessionData?.user?.email || 'anonymous'
    });

    if (!sessionData?.authenticated) {
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

    const concurrent = incrIp(ip);
    if (concurrent > config.CONCURRENT_PER_IP) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Too many concurrent sessions from your IP'
      }));
      ws.close();
      decrIp(ip);
      return;
    }

    let alive = true;

    ws._sshClient = null;
    ws._sshStream = null;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', async (msg, isBinary) => {
      if (!alive) return;

      if (!isBinary) {
        const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
        const parsed = safeParseJson(msgStr);

        if (!parsed) return;

        if (parsed.type === 'connect') {
          await handleSshConnect(ws, sessionData, parsed, ip);
        } else if (parsed.type === 'resize') {
          const cols = Number.parseInt(parsed.cols || '80', 10);
          const rows = Number.parseInt(parsed.rows || '24', 10);
          ws._sshStream?.setWindow?.(rows, cols, rows * 8, cols * 8);
        }
        return;
      }

      // Binary message -> forward to SSH input
      if (ws._sshStream) {
        try {
          ws._sshStream.write(msg);
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
      if (ws._sshClient) {
        try {
          ws._sshClient.end();
        } catch (error) {
          logger.debug('Failed to end SSH client', { error: error.message });
        }
      }
      decrIp(ip);
    });

    ws.on('error', () => {
      ws.terminate();
    });
  });

  // Periodic keepalive ping
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);

  // Periodic Turnstile token cleanup
  setInterval(() => {
    cleanupExpiredTurnstileTokens(wss.clients);
  }, 5 * 60 * 1000);

  return wss;
}

module.exports = {
  createWebSocketServer,
  cleanupExpiredTurnstileTokens,
  storeVerifiedToken,
  consumeVerifiedToken,
  incrIp,
  decrIp,
  checkSshAttempts,
  incrementSshAttempts
};
