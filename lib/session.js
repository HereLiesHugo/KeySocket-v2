/**
 * Session management module
 * Handles session store setup, configuration, and cleanup
 */

const fs = require('node:fs');
const path = require('node:path');
const session = require('express-session');
const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const { logger } = require('./logging');
const config = require('./config');

const FileStore = require('session-file-store')(session);

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Create session store
const sessionStore = new FileStore({
  path: sessionsDir,
  ttl: 86400, // 24 hours
  retries: 0,
  reapInterval: -1,
  logFn: function() {} // Silence library's internal logging
});

/**
 * Session parser for WebSocket connections
 * Validates signed session cookies and retrieves session data
 * @param {Object} req - Express request object
 * @param {Function} callback - Callback with (error, sessionData)
 */
function parseWebSocketSession(req, callback) {
  const cookieHeader = req?.headers?.cookie || null;
  if (!cookieHeader) {
    logger.debug('WebSocket connection without cookie header', {
      ip: getReqRemoteIp(req)
    });
    return callback(null, null);
  }

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
      logger.debug('No session cookie found in WebSocket upgrade', {
        ip: getReqRemoteIp(req)
      });
      return callback(null, null);
    }

    // Verify the signed cookie signature
    const sessionId = cookieParser.signedCookie(rawSessionId, config.SESSION_SECRET);
    if (!sessionId) {
      logger.debug('Invalid cookie signature on WebSocket upgrade', {
        ip: getReqRemoteIp(req),
        raw_id: rawSessionId.substring(0, 20) + '...'
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
    let called = false;
    const timer = setTimeout(() => {
      if (!called) {
        called = true;
        logger.warn('Session store timeout on WebSocket upgrade', {
          timeout_ms: config.SESSION_STORE_GET_TIMEOUT_MS
        });
        callback(null, null);
      }
    }, config.SESSION_STORE_GET_TIMEOUT_MS);

    sessionStore.get(cleanSessionId, (err, sessionObj) => {
      if (called) return;
      called = true;
      clearTimeout(timer);

      if (err) {
        logger.debug('Session store error', {
          error: err.message
        });
        return callback(null, null);
      }

      if (!sessionObj) {
        logger.debug('Session not found in store');
        return callback(null, null);
      }

      // Check if session has passport data
      if (!sessionObj.passport || !sessionObj.passport.user) {
        logger.debug('No passport user in session');
        return callback(null, null);
      }

      const user = sessionObj.passport.user;
      logger.debug('Session found and authenticated', {
        user_email: user.email,
        user_id: user.id
      });

      callback(null, {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        },
        sessionId: cleanSessionId,
        turnstileVerifiedIP: sessionObj.turnstileVerifiedIP || null
      });
    });
  } catch (error) {
    logger.error('Exception in WebSocket session parsing', {
      error: error.message,
      stack: error.stack
    });
    callback(null, null);
  }
}

/**
 * Helper: determine remote IP with proxy awareness
 * @param {Object} req - Express request object
 * @returns {string} Remote IP address
 */
function getReqRemoteIp(req) {
  if (config.BEHIND_PROXY && req?.headers?.['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || 'unknown';
}

/**
 * Derive cookie security settings from environment
 * @returns {Object} Cookie configuration
 */
function getCookieConfig() {
  const cookieSecure = (config.USE_TLS === true) || config.BEHIND_PROXY;
  let cookieSameSite = config.SESSION_COOKIE_SAMESITE;

  // Browsers require SameSite=None to be paired with Secure flag; enforce that.
  if (cookieSameSite.toLowerCase() === 'none' && !cookieSecure) {
    logger.warn('SESSION_COOKIE_SAMESITE set to "none" but cookies would not be Secure; overriding to "lax"');
    cookieSameSite = 'lax';
  }

  return {
    secure: !!cookieSecure,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: cookieSameSite
  };
}

/**
 * Create session middleware
 * @returns {Function} Express middleware
 */
function createSessionMiddleware() {
  const cookieConfig = getCookieConfig();

  const sessionConfig = {
    store: sessionStore,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: cookieConfig
  };

  // Log session cookie settings
  logger.info('Session configuration', {
    cookie_secure: sessionConfig.cookie.secure,
    cookie_sameSite: sessionConfig.cookie.sameSite,
    session_ttl_ms: sessionConfig.cookie.maxAge,
    store_encrypted: !!config.FILESTORE_ENCRYPTION_KEY
  });

  return session(sessionConfig);
}

/**
 * Clean up expired session files
 */
function cleanupExpiredSessions() {
  try {
    logger.info('Starting session cleanup process');

    if (!fs.existsSync(sessionsDir)) {
      logger.debug('Sessions directory does not exist', { path: sessionsDir });
      return;
    }

    const files = fs.readdirSync(sessionsDir);
    let cleanedCount = 0;
    let totalSize = 0;

    logger.debug(`Found ${files.length} session files to check`);

    files.forEach(file => {
      // Prevent directory traversal attacks
      const normalizedFile = path.normalize(file);
      while (normalizedFile.startsWith('..' + path.sep) || normalizedFile.startsWith('../') || normalizedFile.startsWith('..\\')) {
        // Skip if contains traversal attempts
        return;
      }

      try {
        const filePath = path.join(sessionsDir, normalizedFile);
        const stats = fs.statSync(filePath);
        const fileAge = Date.now() - stats.mtimeMs;
        const MAX_AGE_MS = 86400 * 1000; // 24 hours

        if (stats.isFile() && fileAge > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          totalSize += stats.size;
        }
      } catch (err) {
        logger.debug('Error processing session file', {
          file: file,
          error: err.message
        });
      }
    });

    if (cleanedCount > 0) {
      logger.info('Session cleanup completed', {
        files_deleted: cleanedCount,
        total_size_freed_bytes: totalSize
      });
    } else {
      logger.debug('No expired sessions to clean up');
    }
  } catch (error) {
    logger.error('Error during session cleanup', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Start periodic cleanup of expired sessions
 */
function startPeriodicCleanup() {
  // Run cleanup on startup
  cleanupExpiredSessions();

  // Run periodic cleanup every 6 hours
  setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000);
}

module.exports = {
  sessionStore,
  sessionsDir,
  parseWebSocketSession,
  getReqRemoteIp,
  getCookieConfig,
  createSessionMiddleware,
  cleanupExpiredSessions,
  startPeriodicCleanup
};
