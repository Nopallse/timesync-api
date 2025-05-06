const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const authMiddleware = require('../middlewares/authMiddleware');

// Apply authentication middleware to all calendar routes
router.use(authMiddleware.isAuthenticated);

// Get events
router.get('/events', calendarController.getEvents);

// Create event
router.post('/events', calendarController.createEvent);

// Get event details
router.get('/events/:eventId', calendarController.getEventDetails);

// Update event
router.put('/events/:eventId', calendarController.updateEvent);

// Delete event
router.delete('/events/:eventId', calendarController.deleteEvent);

module.exports = router;