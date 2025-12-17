const express = require('express');
const passport = require('passport');
const logger = require('../lib/logger');
const router = express.Router();

// Google OAuth routes
router.get('/google',
  // If already authenticated, do not start a new OAuth flow
  (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.redirect('/console?auth=already');
    }
    return next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
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
        
        logger.info('Session regenerated successfully after OAuth login', {
          user_email: req.user.email,
          user_id: req.user.id
        });
        
        // Successful authentication, redirect to console page with success indicator
        res.redirect('/console?auth=success');
      });
    });
  });

// Logout route
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/console');
  });
});

// Simple endpoint to report current auth status to frontend
router.get('/status', (req, res) => {
  const isAuth = !!(req.isAuthenticated && req.isAuthenticated());
  const user = isAuth && req.user ? {
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture
  } : null;
  res.json({ authenticated: isAuth, user });
});

module.exports = router;
