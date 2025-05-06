const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');

// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/failed' }),
  authController.googleCallback
);

// Check authentication status
router.get('/status', authController.checkAuthStatus);

// Logout
router.get('/logout', authController.logout);

// Auth failure
router.get('/failed', (req, res) => {
  res.status(401).json({ success: false, message: 'Authentication failed' });
});

module.exports = router;