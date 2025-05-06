const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');
const authMiddleware = require('../middlewares/authMiddleware');

// Apply authentication middleware to all meeting routes
router.use(authMiddleware.isAuthenticated);

// Create a new meeting
router.post('/', meetingController.createMeeting);

// Get all meetings for the current user
router.get('/', meetingController.getUserMeetings);


// Get a specific meeting by ID
router.get('/:meetingId', meetingController.getMeetingById);

// Update a meeting
router.put('/:meetingId', meetingController.updateMeeting);

// Delete a meeting
router.delete('/:meetingId', meetingController.deleteMeeting);

router.get('/:meetingId/timeslots', meetingController.getMeetingTimeSlots);

// Get available time slots for a meeting
router.get('/:meetingId/availability', meetingController.getMeetingAvailability);

// Get available time slots for a meeting
router.get('/:meetingId/availability', meetingController.getMeetingAvailability);

// Submit availability for a meeting
router.post('/:meetingId/availability', meetingController.submitAvailability);

// Schedule a meeting
router.post('/:meetingId/schedule', meetingController.scheduleMeeting);

module.exports = router;