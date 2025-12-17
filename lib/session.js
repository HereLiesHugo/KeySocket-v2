const path = require('node:path');
const fs = require('node:fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const logger = require('./logger');

// Ensure secure cookies (sessions) work when behind a proxy/CDN like Cloudflare
const BEHIND_PROXY = typeof process.env.BEHIND_PROXY !== 'undefined' ? (process.env.BEHIND_PROXY === 'true') : true;

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, '..', 'sessions');
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
  // Silence the library's internal logging
  logFn: function() {},
  secret: process.env.FILESTORE_ENCRYPTION_KEY
});

// Configure cookies
const cookieSecure = (process.env.USE_TLS === 'true') || BEHIND_PROXY;
let cookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax');
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

// Log session cookie settings
logger.info('Session configuration', {
  cookie_secure: sessionConfig.cookie.secure,
  cookie_sameSite: sessionConfig.cookie.sameSite,
  session_ttl_ms: sessionConfig.cookie.maxAge ? sessionConfig.cookie.maxAge : undefined,
  store_encrypted: !!process.env.FILESTORE_ENCRYPTION_KEY
});

const sessionMiddleware = session(sessionConfig);

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
      // SECURITY: Validate file path to prevent path traversal
      if (file.includes('..') || file.includes('/') || file.includes('\\')) {
        logger.warn('Rejected suspicious session filename', { filename: file });
        return;
      }
      
      const filePath = path.join(sessionsDir, file);
      
      // SECURITY: Verify the resolved path is within sessionsDir
      const resolvedPath = path.resolve(filePath);
      const resolvedBase = path.resolve(sessionsDir);
      if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
        logger.warn('Path traversal attempt detected in session cleanup', { 
          filename: file, 
          resolved: resolvedPath,
          base: resolvedBase
        });
        return;
      }
      
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

// Start cleanup schedule
const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);

module.exports = {
  sessionStore,
  sessionMiddleware,
  sessionConfig
};
