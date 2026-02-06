/**
 * Authentication module
 * Handles Passport.js setup and OAuth configuration
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { logger } = require('./logging');
const config = require('./config');

/**
 * Initialize Passport authentication strategies
 */
function initializePassport() {
  // Passport session setup
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  // Google OAuth strategy
  passport.use(new GoogleStrategy({
    clientID: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    callbackURL: config.APP_BASE_URL + '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Store user profile in session
    return done(null, {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      picture: profile.photos[0].value
    });
  }));

  logger.info('Passport authentication initialized', {
    google_oauth_enabled: !!config.GOOGLE_CLIENT_ID,
    callback_url: config.APP_BASE_URL + '/auth/google/callback'
  });
}

/**
 * Validate user authentication status
 * @param {Object} req - Express request object
 * @returns {boolean} True if user is authenticated
 */
function isUserAuthenticated(req) {
  return !!(req.isAuthenticated?.());
}

/**
 * Get current authenticated user
 * @param {Object} req - Express request object
 * @returns {Object|null} User object or null
 */
function getAuthenticatedUser(req) {
  if (!isUserAuthenticated(req) || !req.user) {
    return null;
  }

  return {
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture
  };
}

/**
 * Middleware to check if user is already authenticated
 * Prevents starting a new OAuth flow if already authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 */
function preventDoubleAuth(req, res, next) {
  if (isUserAuthenticated(req)) {
    return res.redirect('/console?auth=already');
  }
  return next();
}

module.exports = {
  passport,
  initializePassport,
  isUserAuthenticated,
  getAuthenticatedUser,
  preventDoubleAuth
};
