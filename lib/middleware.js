/**
 * Middleware module
 * Centralized security and request handling middleware
 */

const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { logger } = require('./logging');
const config = require('./config');

/**
 * Setup all security and logging middleware
 * @param {Object} app - Express application
 */
function setupSecurityMiddleware(app) {
  // Trust proxy setting (for X-Forwarded-For headers behind CDN/load balancer)
  app.set('trust proxy', config.BEHIND_PROXY);
  logger.info('Express trust proxy setting', { trust_proxy: config.BEHIND_PROXY });

  // Helmet for basic security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Handled by nginx
    crossOriginResourcePolicy: false
  }));

  // CSP fallback in case of nginx misconfiguration
  app.use((req, res, next) => {
    if (!res.getHeader('Content-Security-Policy')) {
      res.setHeader('Content-Security-Policy',
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

  // CORS middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin;
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
}

/**
 * Setup body parsing middleware
 * @param {Object} app - Express application
 */
function setupBodyParsingMiddleware(app) {
  const express = require('express');
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false }));
}

/**
 * Setup session and authentication middleware
 * @param {Object} app - Express application
 * @param {Function} sessionMiddleware - Express-session middleware
 * @param {Object} passport - Passport instance
 */
function setupSessionAndAuthMiddleware(app, sessionMiddleware, passport) {
  app.use(cookieParser(config.SESSION_SECRET));
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());
}

/**
 * Setup logging middleware
 * @param {Object} app - Express application
 */
function setupLoggingMiddleware(app) {
  const format = config.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(format));
}

/**
 * Setup static file serving middleware
 * @param {Object} app - Express application
 */
function setupStaticFilesMiddleware(app) {
  const express = require('express');
  app.use('/lib', express.static('lib', {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('.js') || path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  app.use('/js', express.static('js', {
    maxAge: '1d',
    etag: true,
    lastModified: true
  }));
}

/**
 * Setup all middleware in proper order
 * @param {Object} app - Express application
 * @param {Function} sessionMiddleware - Express-session middleware
 * @param {Object} passport - Passport instance
 */
function setupAllMiddleware(app, sessionMiddleware, passport) {
  setupSecurityMiddleware(app);
  setupBodyParsingMiddleware(app);
  setupSessionAndAuthMiddleware(app, sessionMiddleware, passport);
  setupLoggingMiddleware(app);
  setupStaticFilesMiddleware(app);
}

module.exports = {
  setupSecurityMiddleware,
  setupBodyParsingMiddleware,
  setupSessionAndAuthMiddleware,
  setupLoggingMiddleware,
  setupStaticFilesMiddleware,
  setupAllMiddleware
};
