const { google } = require('googleapis');

// Helper function to get calendar client
const getCalendarClient = (user) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
};

// Get user's calendar events
exports.getEvents = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    console.log(req.query, 'query params');
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }
    
    const calendar = getCalendarClient(req.user);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items;
    
    res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar events',
      error: error.message,
    });
  }
};

exports.checkTimeSlotAvailability = async (req, res) => {
  try {
    const { timeSlots } = req.body;
    
    if (!timeSlots || !Array.isArray(timeSlots) || timeSlots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Time slots array is required',
      });
    }
    
    const calendar = getCalendarClient(req.user);
    
    // Extract all unique dates from the time slots
    const uniqueDates = [...new Set(timeSlots.map(slot => slot.split('T')[0]))];
    
    // Get all events for these dates
    const events = [];
    
    for (const date of uniqueDates) {
      const startTime = new Date(`${date}T00:00:00.000Z`);
      const endTime = new Date(`${date}T23:59:59.999Z`);
      
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true,
      });
      
      events.push(...response.data.items);
    }
    
    // Check each time slot against the events
    const availableTimeSlots = [];
    
    for (const timeSlot of timeSlots) {
      const [dateStr, timeRange] = timeSlot.split('T');
      const [startTimeStr, endTimeStr] = timeRange.split('-');
      
      const slotStart = new Date(`${dateStr}T${startTimeStr}:00.000Z`);
      const slotEnd = new Date(`${dateStr}T${endTimeStr}:00.000Z`);
      
      // Check if this slot conflicts with any event
      const conflicts = events.some(event => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        
        // Check for overlap
        return (
          (slotStart >= eventStart && slotStart < eventEnd) ||
          (slotEnd > eventStart && slotEnd <= eventEnd) ||
          (slotStart <= eventStart && slotEnd >= eventEnd)
        );
      });
      
      if (!conflicts) {
        availableTimeSlots.push(timeSlot);
      }
    }
    
    res.status(200).json({
      success: true,
      availableTimeSlots,
    });
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check time slot availability',
      error: error.message,
    });
  }
};

// Create a new calendar event
exports.createEvent = async (req, res) => {
  try {
    const calendar = getCalendarClient(req.user);
    const { summary, description, start, end, location, attendees } = req.body;
    
    const event = {
      summary,
      description,
      start,
      end,
      location,
      attendees: attendees?.map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    res.status(201).json({
      success: true,
      event: response.data,
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create calendar event',
      error: error.message,
    });
  }
};

// Get event details
exports.getEventDetails = async (req, res) => {
  try {
    const calendar = getCalendarClient(req.user);
    const { eventId } = req.params;
    
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId,
    });

    res.status(200).json({
      success: true,
      event: response.data,
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event details',
      error: error.message,
    });
  }
};

// Update an event
exports.updateEvent = async (req, res) => {
  try {
    const calendar = getCalendarClient(req.user);
    const { eventId } = req.params;
    const { summary, description, start, end, location, attendees } = req.body;
    
    const event = {
      summary,
      description,
      start,
      end,
      location,
      attendees: attendees?.map(email => ({ email })),
    };

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      resource: event,
    });

    res.status(200).json({
      success: true,
      event: response.data,
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update calendar event',
      error: error.message,
    });
  }
};

// Delete an event
exports.deleteEvent = async (req, res) => {
  try {
    const calendar = getCalendarClient(req.user);
    const { eventId } = req.params;
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete calendar event',
      error: error.message,
    });
  }
};