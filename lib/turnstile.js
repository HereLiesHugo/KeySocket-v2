/**
 * Turnstile Token Management Logic
 */
const crypto = require("crypto");

/**
 * Consume and validate a Turnstile verification token
 * @param {string} token - The token to validate
 * @param {string} remoteIp - The IP address attempting to use the token
 * @param {object} sessionStore - The session store instance (must support .all() and .set())
 * @param {object} logger - Logger instance (must support .debug(), .warn(), .error())
 * @param {function(boolean): void} callback - Callback with validation result
 */
/**
 * Consume and validate a Turnstile verification token
 * @param {string} token - The token to validate
 * @param {string} sessionId - The session ID to look up
 * @param {string} remoteIp - The IP address attempting to use the token
 * @param {object} sessionStore - The session store instance (must support .get() and .set())
 * @param {object} logger - Logger instance (must support .debug(), .warn(), .error())
 * @param {function(boolean): void} callback - Callback with validation result
 */
function consumeVerifiedToken(
  token,
  sessionId,
  remoteIp,
  sessionStore,
  logger,
  callback
) {
  // Synchronous validation checks
  if (!token || typeof token !== "string") {
    logger.debug("Invalid token format", { token_type: typeof token });
    return callback(false);
  }

  if (!sessionId || typeof sessionId !== "string") {
    logger.debug("Missing sessionId for token validation");
    return callback(false);
  }

  if (!sessionStore || typeof sessionStore.get !== "function") {
    logger.error("Session store not available for token validation");
    return callback(false);
  }

  // O(1) session store lookup using sessionId
  try {
    sessionStore.get(sessionId, (err, session) => {
      if (err) {
        logger.error("Failed to retrieve session for token validation", {
          error: err.message,
          session_id: sessionId,
        });
        return callback(false);
      }

      if (!session) {
        logger.debug("Session not found", { session_id: sessionId });
        return callback(false);
      }

      // Verify token match (constant time comparison)
      if (
        !session.turnstileToken ||
        !crypto.timingSafeEqual(
          Buffer.from(session.turnstileToken),
          Buffer.from(token)
        )
      ) {
        logger.debug("Token mismatch or missing", {
          session_id: sessionId,
          has_token: !!session.turnstileToken,
        });
        return callback(false);
      }

      // Check expiration
      if (
        !session.turnstileTokenExpires ||
        session.turnstileTokenExpires < Date.now()
      ) {
        logger.debug("Token expired", {
          token: token.substring(0, 10) + "...",
          expires: session.turnstileTokenExpires,
          now: Date.now(),
        });
        return callback(false);
      }

      // Check IP binding if present
      if (
        session.turnstileVerifiedIP &&
        session.turnstileVerifiedIP !== remoteIp
      ) {
        logger.warn("Token IP mismatch", {
          token: token.substring(0, 10) + "...",
          expected_ip: session.turnstileVerifiedIP,
          actual_ip: remoteIp,
        });
        return callback(false);
      }

      // Token is valid - consume it (one-time use)
      delete session.turnstileToken;
      delete session.turnstileTokenExpires;

      // Persist the session update
      sessionStore.set(sessionId, session, (setErr) => {
        if (setErr) {
          logger.error("Failed to update session after token consumption", {
            session_id: sessionId,
            error: setErr.message,
          });
          // We fail secure if we can't consume the token
          return callback(false);
        }

        logger.debug("Token consumed successfully", {
          token: token.substring(0, 10) + "...",
          session_id: sessionId,
          ip: remoteIp,
        });
        return callback(true);
      });
    });
  } catch (error) {
    logger.error("Error during token validation", {
      error: error.message,
      stack: error.stack,
    });
    return callback(false);
  }
}

module.exports = { consumeVerifiedToken };
