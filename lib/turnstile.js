/**
 * Turnstile Token Management Logic
 */
const crypto = require('crypto');

/**
 * Consume and validate a Turnstile verification token
 * @param {string} token - The token to validate
 * @param {string} remoteIp - The IP address attempting to use the token
 * @param {object} sessionStore - The session store instance (must support .all() and .set())
 * @param {object} logger - Logger instance (must support .debug(), .warn(), .error())
 * @param {function(boolean): void} callback - Callback with validation result
 */
function consumeVerifiedToken(token, remoteIp, sessionStore, logger, callback) {
  // Synchronous validation checks
  if (!token || typeof token !== 'string') {
    logger.debug('Invalid token format', { token_type: typeof token });
    return callback(false);
  }

  if (!sessionStore || typeof sessionStore.all !== 'function') {
    logger.error('Session store not available for token validation');
    return callback(false);
  }

  // Async session store lookup
  // Note: This operation can be slow (O(N)) as it scans the entire session store.
  // Ideally, we should maintain a secondary index (token -> sessionId) for O(1) lookup.
  try {
    sessionStore.all((err, sessions) => {
      if (err) {
        logger.error('Failed to retrieve sessions for token validation', { error: err.message });
        return callback(false);
      }

      if (!sessions) {
        logger.debug('No sessions found');
        return callback(false);
      }

      // Find session with matching token
      for (const sessionId in sessions) {
        const session = sessions[sessionId];
        
        if (crypto.timingSafeEqual(Buffer.from(session.turnstileToken), Buffer.from(token))) {
          // Check expiration
          if (!session.turnstileTokenExpires || session.turnstileTokenExpires < Date.now()) {
            logger.debug('Token expired', {
              token: token.substring(0, 10) + '...',
              expires: session.turnstileTokenExpires,
              now: Date.now()
            });
            return callback(false);
          }

          // Check IP binding if present
          if (session.turnstileVerifiedIP && session.turnstileVerifiedIP !== remoteIp) {
            logger.warn('Token IP mismatch', {
              token: token.substring(0, 10) + '...',
              expected_ip: session.turnstileVerifiedIP,
              actual_ip: remoteIp
            });
            return callback(false);
          }

          // Token is valid - consume it (one-time use)
          delete session.turnstileToken;
          delete session.turnstileTokenExpires;
          
          // Persist the session update
          sessionStore.set(sessionId, session, (setErr) => {
            if (setErr) {
              logger.error('Failed to update session after token consumption', {
                session_id: sessionId,
                error: setErr.message
              });
              // We fail secure if we can't consume the token
              return callback(false);
            }
            
            logger.debug('Token consumed successfully', {
              token: token.substring(0, 10) + '...',
              session_id: sessionId,
              ip: remoteIp
            });
            return callback(true);
          });

          return; // Exit loop and wait for set() callback
        }
      }

      // Token not found in any session
      logger.debug('Token not found in any session', {
        token: token.substring(0, 10) + '...'
      });
      return callback(false);
    });
  } catch (error) {
    logger.error('Error during token validation', {
      error: error.message,
      stack: error.stack
    });
    return callback(false);
  }
}

module.exports = { consumeVerifiedToken };
