// Google OAuth callback
exports.googleCallback = (req, res) => {
    res.redirect('http://localhost:5173/dashboard'); 
};
  
  // Check if user is authenticated
  exports.checkAuthStatus = (req, res) => {
    if (req.isAuthenticated()) {
      res.status(200).json({
        success: true,
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          photo: req.user.photo,
        },
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }
  };
  
  // Logout
  exports.logout = (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Error logging out' });
      }
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    });
  };