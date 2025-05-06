const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/invitationController');
const authMiddleware = require('../middlewares/authMiddleware');

// Generate a new meeting invitation link (requires authentication)
router.post('/meetings/:meetingId/invitation', 
  authMiddleware.isAuthenticated,
  invitationController.generateInvitation
);

// Access a meeting via invitation link (public endpoint)
router.get('/meetings/join/:token', 
  invitationController.joinMeeting
);

// Submit availability for a meeting (requires token or authentication)
router.post('/meetings/:meetingId/availability', 
  invitationController.submitAvailability
);

// Accept or decline a meeting invitation
router.post('/invitation/:participantToken/respond',
  invitationController.respondToInvitation
);

module.exports = router;