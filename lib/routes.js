/**
 * Routes module
 * Handles all HTTP endpoints and request handlers
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { logger } = require('./logging');
const { isUserAuthenticated, getAuthenticatedUser } = require('./auth');
const { getReqRemoteIp } = require('./session');
const config = require('./config');

/**
 * Get asset version for cache-busting
 * @returns {string} Asset version
 */
function getAssetVersion() {
  return config.ASSET_VERSION || (() => {
    try {
      return require(path.join(__dirname, '..', 'package.json')).version || String(Date.now());
    } catch (error) {
      logger.debug('Failed to read package.json version', { error: error.message });
      return String(Date.now());
    }
  })();
}

const ASSET_VERSION = getAssetVersion();

/**
 * Serve index.html with asset version injection
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function serveIndex(req, res) {
  try {
    const indexPath = path.join(__dirname, '..', 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replaceAll('__ASSET_VERSION__', ASSET_VERSION);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    logger.error('Failed to serve index page', { error: error.message });
    return res.status(500).send('Server error');
  }
}

/**
 * Serve console.html with asset version injection
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function serveConsole(req, res) {
  try {
    const consolePath = path.join(__dirname, '..', 'console.html');
    let html = fs.readFileSync(consolePath, 'utf8');
    html = html.replaceAll('__ASSET_VERSION__', ASSET_VERSION);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    logger.error('Failed to serve console page', { error: error.message });
    return res.status(500).send('Server error');
  }
}

/**
 * Verify Turnstile token with Cloudflare
 * @param {string} token - Turnstile token to verify
 * @param {number} attempt - Current attempt number
 * @returns {Promise} Resolves with parsed response from Cloudflare
 */
function verifyWithCloudflare(token, remoteIp, attempt = 0) {
  return new Promise((resolve, reject) => {
    const postData = `secret=${encodeURIComponent(config.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(remoteIp || '')}`;

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

    const request = https.request(options, (resp) => {
      let data = '';
      let aborted = false;

      resp.on('data', (chunk) => {
        data += chunk.toString();
      });

      resp.on('aborted', () => {
        aborted = true;
      });

      resp.on('end', () => {
        if (aborted) return reject(new Error('response aborted'));

        const statusOk = resp.statusCode === 200;
        const contentType = (resp.headers['content-type'] || '') + '';
        const looksJson = /application\/json/.test(contentType.toLowerCase());

        if (!statusOk || !looksJson) {
          // Retry on server errors (5xx)
          if (resp.statusCode >= 500 && attempt < config.TURNSTILE_MAX_RETRIES) {
            const backoff = 200 * Math.pow(2, attempt);
            logger.warn('Turnstile provider error, retrying', {
              status: resp.statusCode,
              attempt,
              backoff
            });
            return setTimeout(() => verifyWithCloudflare(token, remoteIp, attempt + 1).then(resolve).catch(reject), backoff);
          }
          const err = new Error('turnstile provider error');
          err.status = resp.statusCode;
          err.body = data;
          err.headers = resp.headers;
          return reject(err);
        }

        // Check length mismatch for diagnostics
        const declaredLen = Number.parseInt(resp.headers['content-length'] || '0', 10) || 0;
        if (declaredLen > 0 && declaredLen !== data.length) {
          logger.warn('Turnstile response length mismatch', {
            declared: declaredLen,
            received: data.length
          });
        }

        try {
          const parsed = JSON.parse(data);
          return resolve(parsed);
        } catch (parseError) {
          logger.error('Failed to parse Turnstile response', {
            error: parseError.message,
            body: data
          });
          const err = new Error('invalid json');
          err.body = data;
          return reject(err);
        }
      });

      resp.on('error', (e) => reject(e));
    });

    request.on('timeout', () => {
      request.destroy();
      return reject(new Error('timeout'));
    });

    request.on('error', (err) => {
      // Network error; retry for transient errors
      if (attempt < config.TURNSTILE_MAX_RETRIES) {
        const backoff = 200 * Math.pow(2, attempt);
        logger.warn('Turnstile request network error, retrying', {
          error: err.message,
          attempt,
          backoff
        });
        return setTimeout(() => verifyWithCloudflare(token, remoteIp, attempt + 1).then(resolve).catch(reject), backoff);
      }
      return reject(err);
    });

    request.setTimeout(config.TURNSTILE_REQUEST_TIMEOUT_MS);
    request.write(postData);
    request.end();
  });
}

/**
 * Handle Turnstile verification requests
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function handleTurnstileVerify(req, res) {
  const token = req.body?.token || '';

  logger.debug('Turnstile verification request received', {
    has_token: !!token,
    ip: getReqRemoteIp(req)
  });

  if (!token) {
    return res.status(400).json({ ok: false, message: 'missing token' });
  }

  if (!config.TURNSTILE_SECRET) {
    logger.error('TURNSTILE_SECRET not configured in environment');
    return res.status(500).json({ ok: false, message: 'server misconfigured: TURNSTILE_SECRET not set' });
  }

  const remoteIp = getReqRemoteIp(req) || req.socket.remoteAddress || '';

  verifyWithCloudflare(token, remoteIp).then((parsed) => {
    if (parsed?.success) {
      if (!req.session) {
        logger.warn('[Turnstile] No session available for token storage');
        return res.status(500).json({ ok: false, message: 'session required' });
      }

      const serverToken = crypto.randomBytes(24).toString('hex');
      const expires = Date.now() + config.TURNSTILE_TOKEN_TTL_MS;

      req.session.turnstileToken = serverToken;
      req.session.turnstileTokenExpires = expires;
      // Store the client's IP as seen by the app (respecting proxy headers)
      try {
        req.session.turnstileVerifiedIP = getReqRemoteIp(req) || '';
      } catch (error) {
        logger.debug('Failed to get remote IP for Turnstile verification', {
          error: error.message
        });
        req.session.turnstileVerifiedIP = req.socket.remoteAddress || '';
      }

      const responseData = JSON.stringify({
        ok: true,
        token: serverToken,
        ttl: config.TURNSTILE_TOKEN_TTL_MS
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Length', Buffer.byteLength(responseData));
      res.status(200).end(responseData);

      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error('[Turnstile] Failed to save session', saveErr);
        } else {
          logger.info('Turnstile verification successful', {
            user_email: req.session.passport?.user?.email || 'anonymous',
            ip: remoteIp
          });
        }
      });
    } else {
      logger.warn('[Turnstile] Verification failed', { success: parsed?.success });
      return res.status(400).json({
        ok: false,
        message: 'verification failed',
        details: parsed
      });
    }
  }).catch((err) => {
    logger.error('[Turnstile] Verification request failed', {
      error: err?.message,
      status: err?.status
    });
    if (!res.headersSent) {
      if (err?.status >= 500) {
        return res.status(502).json({ ok: false, message: 'turnstile provider error' });
      }
      return res.status(500).json({ ok: false, message: 'verification error' });
    }
  });
}

/**
 * Register all routes with the Express app
 * @param {Object} app - Express application
 * @param {Object} passport - Passport instance
 */
function registerRoutes(app, passport) {
  // Rate limit all requests (basic protection)
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: config.RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: true
  });
  app.use(limiter);

  // ===== Authentication Routes =====

  // Google OAuth initiation (check if already authenticated)
  app.get('/auth/google',
    (req, res, next) => {
      if (isUserAuthenticated(req)) {
        return res.redirect('/console?auth=already');
      }
      return next();
    },
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  // Google OAuth callback
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

          logger.info('User authenticated via OAuth', {
            user_email: req.user.email,
            user_id: req.user.id
          });

          res.redirect('/console?auth=success');
        });
      });
    }
  );

  // Logout route
  app.get('/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err);
      }
      res.redirect('/console');
    });
  });

  // Get current auth status
  app.get('/auth/status', (req, res) => {
    const user = getAuthenticatedUser(req);
    res.json({
      authenticated: !!user,
      user
    });
  });

  // ===== Static and HTML Routes =====

  // Serve static files but don't auto-serve index.html so we can inject asset version
  const publicDir = path.join(__dirname, '..');
  app.use(express.static(publicDir, { index: false }));

  // Serve xterm libraries from node_modules (with proper MIME types)
  app.get('/lib/xterm.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.sendFile(path.join(__dirname, '..', 'node_modules/@xterm/xterm/css/xterm.css'));
  });

  app.get('/lib/xterm.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(path.join(__dirname, '..', 'node_modules/@xterm/xterm/lib/xterm.js'));
  });

  app.get('/lib/xterm-addon-fit.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(path.join(__dirname, '..', 'node_modules/@xterm/addon-fit/lib/addon-fit.js'));
  });

  app.get('/lib/xterm-addon-webgl.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(path.join(__dirname, '..', 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'));
  });

  // Main pages
  app.get('/', serveIndex);
  app.get('/index.html', serveIndex);
  app.get('/console', serveConsole);
  app.get('/console.html', serveConsole);

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      env: config.NODE_ENV
    });
  });

  // ===== API Routes =====

  // Turnstile verification
  app.post('/turnstile-verify', handleTurnstileVerify);
}

module.exports = {
  registerRoutes,
  serveIndex,
  serveConsole,
  handleTurnstileVerify,
  verifyWithCloudflare,
  getAssetVersion
};
