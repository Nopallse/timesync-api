const { Meeting, User, Participant, AvailabilitySlot } = require('../models');
const { google } = require('googleapis');
const { Op } = require('sequelize');

// Helper function to get calendar client (reused from calendarController)
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


const generateTimeSlots = (startDate, endDate, startTime, endTime, duration, eventDays = 3) => {
  const slots = [];
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);
  
  // Loop through each day in the date range
  while (currentDate <= lastDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Check if this day should be included based on eventDays setting
    // eventDays: 1 = weekdays, 2 = weekends, 3 = all days
    let includeDay = false;
    if (eventDays === 3) {
      includeDay = true; // All days
    } else if (eventDays === 1 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      includeDay = true; // Weekdays only
    } else if (eventDays === 2 && (dayOfWeek === 0 || dayOfWeek === 6)) {
      includeDay = true; // Weekends only
    }
    
    if (includeDay) {
      // Parse start and end times
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      
      // Set current time to start time
      let currentSlotTime = new Date(dateStr);
      currentSlotTime.setHours(startHour, startMinute, 0, 0);
      
      // Set end time for the day
      let endTimeForDay = new Date(dateStr);
      endTimeForDay.setHours(endHour, endMinute, 0, 0);
      
      // Generate slots for this day based on meeting duration (in hours)
      while (currentSlotTime.getTime() + (duration * 60 * 60 * 1000) <= endTimeForDay.getTime()) {
        const slotStartTime = `${String(currentSlotTime.getHours()).padStart(2, '0')}:${String(currentSlotTime.getMinutes()).padStart(2, '0')}`;
        
        // Calculate slot end time
        const slotEndTime = new Date(currentSlotTime.getTime() + (duration * 60 * 60 * 1000));
        const formattedEndTime = `${String(slotEndTime.getHours()).padStart(2, '0')}:${String(slotEndTime.getMinutes()).padStart(2, '0')}`;
        
        slots.push({
          date: dateStr,
          startTime: slotStartTime,
          endTime: formattedEndTime,
          timeSlotKey: `${dateStr}T${slotStartTime}-${formattedEndTime}`
        });
        
        // Move to next slot
        currentSlotTime = slotEndTime;
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return slots;
};


// Create a new meeting
exports.createMeeting = async (req, res) => {
  try {
    const { title, startDate, endDate, duration, participantEmails, timeRange, eventDays } = req.body;
    
    // Create meeting in database
    const meeting = await Meeting.create({
      title,
      startDate,
      endDate,
      duration,
      organizerId: req.user.id,
      timeRangeStart: timeRange?.startTime,
      timeRangeEnd: timeRange?.endTime,
      eventDays: eventDays || 5, // Default to weekdays
      status: 'pending'
    });
    
    // Add participants
    const participants = await Promise.all(
      participantEmails.map(async (email) => {
        // Check if participant is a registered user
        const user = await User.findOne({ where: { email } });
        
        return Participant.create({
          meetingId: meeting.id,
          email,
          userId: user ? user.id : null,
          hasResponded: false
        });
      })
    );
    
    // Get the full meeting with participant count
    const createdMeeting = await Meeting.findByPk(meeting.id, {
      include: [
        { 
          model: User, 
          as: 'organizer',
          attributes: ['id', 'name', 'email']
        },
        { 
          model: Participant,
          attributes: ['id', 'email', 'hasResponded']
        }
      ]
    });
    
    // Format the response
    const formattedMeeting = {
      id: createdMeeting.id,
      title: createdMeeting.title,
      dateRange: `${createdMeeting.startDate} to ${createdMeeting.endDate}`,
      duration: `${createdMeeting.duration} minutes`,
      participants: createdMeeting.Participants.length,
      status: createdMeeting.status,
      organizer: createdMeeting.organizer.email,
      participantEmails: createdMeeting.Participants.map(p => p.email),
      timeRange: {
        startTime: createdMeeting.timeRangeStart,
        endTime: createdMeeting.timeRangeEnd
      },
      eventDays: createdMeeting.eventDays,
      createdAt: createdMeeting.createdAt
    };
    
    res.status(201).json({
      success: true,
      meeting: formattedMeeting,
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create meeting',
      error: error.message,
    });
  }
};

// Get all meetings for the current user
exports.getUserMeetings = async (req, res) => {
    try {
        const { type } = req.query; // Get the type parameter from the query
        
        let meetings = [];
        
        if (!type || type === 'all') {
            // Get all meetings (both organized and participating)
            
            // Get meetings where user is organizer
            const organizedMeetings = await Meeting.findAll({
                where: { organizerId: req.user.id },
                include: [
                    { 
                        model: User, 
                        as: 'organizer',
                        attributes: ['id', 'name', 'email']
                    },
                    { 
                        model: Participant,
                        attributes: ['id', 'email', 'hasResponded']
                    }
                ]
            });
            
            // Get meetings where user is participant
            const participatingMeetings = await Meeting.findAll({
                include: [
                    { 
                        model: User, 
                        as: 'organizer',
                        attributes: ['id', 'name', 'email']
                    },
                    { 
                        model: Participant,
                        where: {
                            [Op.or]: [
                                { email: req.user.email },
                                { userId: req.user.id }
                            ]
                        },
                        attributes: ['id', 'email', 'hasResponded']
                    }
                ]
            });
            
            // Combine and remove duplicates
            meetings = [...organizedMeetings];
            participatingMeetings.forEach(meeting => {
                if (!meetings.some(m => m.id === meeting.id)) {
                    meetings.push(meeting);
                }
            });
            
        } else if (type === 'organized') {
            // Get only meetings where user is organizer
            meetings = await Meeting.findAll({
                where: { organizerId: req.user.id },
                include: [
                    { 
                        model: User, 
                        as: 'organizer',
                        attributes: ['id', 'name', 'email']
                    },
                    { 
                        model: Participant,
                        attributes: ['id', 'email', 'hasResponded']
                    }
                ]
            });
            
        } else if (type === 'participating') {
            // Get only meetings where user is participant
            meetings = await Meeting.findAll({
                include: [
                    { 
                        model: User, 
                        as: 'organizer',
                        attributes: ['id', 'name', 'email']
                    },
                    { 
                        model: Participant,
                        where: {
                            [Op.or]: [
                                { email: req.user.email },
                                { userId: req.user.id }
                            ]
                        },
                        attributes: ['id', 'email', 'hasResponded']
                    }
                ]
            });
        }
        
        // Format the meetings
        const formattedMeetings = meetings.map(meeting => ({
            id: meeting.id,
            title: meeting.title,
            dateRange: `${meeting.startDate} to ${meeting.endDate}`,
            duration: `${meeting.duration} minutes`,
            participants: meeting.Participants.length,
            status: meeting.status,
            organizer: meeting.organizer.email,
            isOrganizer: meeting.organizerId === req.user.id,
            participantEmails: meeting.Participants.map(p => p.email),
            scheduledDate: meeting.scheduledDate,
            scheduledTime: meeting.scheduledTime,
            timeRange: {
                startTime: meeting.timeRangeStart,
                endTime: meeting.timeRangeEnd
            },
            eventDays: meeting.eventDays,
            createdAt: meeting.createdAt
        }));
        
        res.status(200).json({
            success: true,
            meetings: formattedMeetings,
        });
    } catch (error) {
        console.error('Error fetching meetings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch meetings',
            error: error.message,
        });
    }
};

// Get a specific meeting by ID
exports.getMeetingById = async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Find the meeting with its associations
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Participant,
          attributes: ['id', 'email', 'hasResponded', 'token', 'invitationStatus']
        },
        {
          model: AvailabilitySlot,
          include: [User]
        }
      ]
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }

    // Check if user is organizer or participant
    const isOrganizer = meeting.organizerId === req.user.id;
    const isParticipant = meeting.Participants.some(p =>
      p.email === req.user.email || (p.userId && p.userId === req.user.id)
    );

    if (!isOrganizer && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this meeting',
      });
    }

    // Get participant token for the logged-in user
    let participantToken = null;
    if (isParticipant) {
      const matchedParticipant = meeting.Participants.find(p =>
        p.email === req.user.email || (p.userId && p.userId === req.user.id)
      );
      participantToken = matchedParticipant?.token || null;
    }

    // Generate all possible time slots
    const allTimeSlots = generateTimeSlots(
      meeting.startDate,
      meeting.endDate,
      meeting.timeRangeStart,
      meeting.timeRangeEnd,
      meeting.duration,
      meeting.eventDays
    );

    // Process availability data by time slot
    const availabilityByTimeSlot = {};
    
    // Initialize all possible time slots
    allTimeSlots.forEach(slot => {
      availabilityByTimeSlot[slot.timeSlotKey] = {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        participants: 0,
        participantDetails: []
      };
    });
    
    // Fill in participant availability
    meeting.AvailabilitySlots.forEach(slot => {
      const timeSlotKey = `${slot.date}T${slot.startTime}-${slot.endTime}`;
      
      if (availabilityByTimeSlot[timeSlotKey]) {
        availabilityByTimeSlot[timeSlotKey].participants++;
        availabilityByTimeSlot[timeSlotKey].participantDetails.push({
          userId: slot.userId,
          email: slot.User ? slot.User.email : null,
          name: slot.User ? slot.User.name : null
        });
      }
    });
    
    // Convert to array and sort by number of participants (descending)
    const availableSlots = Object.values(availabilityByTimeSlot)
      .sort((a, b) => b.participants - a.participants);

    // Format the meeting
    const formattedMeeting = {
      id: meeting.id,
      title: meeting.title,
      dateRange: `${meeting.startDate} to ${meeting.endDate}`,
      duration: `${meeting.duration} hours`,
      participants: meeting.Participants.length,
      status: meeting.status,
      organizer: meeting.organizer.email,
      isOrganizer,
      hasResponded: meeting.Participants.some(p => 
        (p.email === req.user.email || (p.userId && p.userId === req.user.id)) && p.hasResponded
      ),
      participantEmails: meeting.Participants.map(p => p.email),
      scheduledDate: meeting.scheduledDate,
      scheduledTime: meeting.scheduledTime,
      timeRange: {
        startTime: meeting.timeRangeStart,
        endTime: meeting.timeRangeEnd
      },
      eventDays: meeting.eventDays,
      availableSlots,
      participantToken,
      createdAt: meeting.createdAt
    };

    res.status(200).json({
      success: true,
      meeting: formattedMeeting,
    });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meeting',
      error: error.message,
    });
  }
};


exports.getMeetingTimeSlots = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Generate all possible time slots
    const timeSlots = generateTimeSlots(
      meeting.startDate,
      meeting.endDate,
      meeting.timeRangeStart,
      meeting.timeRangeEnd,
      meeting.duration,
      meeting.eventDays
    );
    
    res.status(200).json({
      success: true,
      meetingId,
      timeSlots,
    });
  } catch (error) {
    console.error('Error generating time slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate time slots',
      error: error.message,
    });
  }
};

// Get available time slots for a meeting
exports.getMeetingAvailability = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        { model: Participant },
        { model: AvailabilitySlot, include: [User] }
      ]
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Generate all possible time slots
    const allTimeSlots = generateTimeSlots(
      meeting.startDate,
      meeting.endDate,
      meeting.timeRangeStart,
      meeting.timeRangeEnd,
      meeting.duration,
      meeting.eventDays
    );
    
    // Process availability data by time slot
    const availabilityByTimeSlot = {};
    
    // Initialize all possible time slots
    allTimeSlots.forEach(slot => {
      availabilityByTimeSlot[slot.timeSlotKey] = {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        participants: 0,
        participantDetails: []
      };
    });
    
    // Fill in participant availability
    meeting.AvailabilitySlots.forEach(slot => {
      const timeSlotKey = `${slot.date}T${slot.startTime}-${slot.endTime}`;
      
      if (availabilityByTimeSlot[timeSlotKey]) {
        availabilityByTimeSlot[timeSlotKey].participants++;
        availabilityByTimeSlot[timeSlotKey].participantDetails.push({
          userId: slot.userId,
          email: slot.User ? slot.User.email : null,
          name: slot.User ? slot.User.name : null
        });
      }
    });
    
    // Convert to array and sort by number of participants (descending)
    const availableSlots = Object.values(availabilityByTimeSlot)
      .sort((a, b) => b.participants - a.participants);
    
    res.status(200).json({
      success: true,
      meetingId,
      availableSlots,
      totalParticipants: meeting.Participants.length,
      respondedParticipants: meeting.Participants.filter(p => p.hasResponded).length
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability',
      error: error.message,
    });
  }
};

// Submit user availability
exports.submitAvailability = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { availableTimeSlots } = req.body; // Changed from availableDates to availableTimeSlots
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId, {
      include: [{ model: Participant }]
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Check if user is a participant
    const participant = meeting.Participants.find(p => 
      p.email === req.user.email || (p.userId && p.userId === req.user.id)
    );
    
    if (!participant && meeting.organizerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this meeting',
      });
    }
    
    // Delete previous availability submissions by this user
    await AvailabilitySlot.destroy({
      where: {
        meetingId,
        userId: req.user.id
      }
    });
    
    // Create new availability slots
    const slots = await Promise.all(
      availableTimeSlots.map(timeSlot => {
        // Parse the timeSlot string (format: "YYYY-MM-DDThh:mm-hh:mm")
        const [dateStr, timeRange] = timeSlot.split('T');
        const [startTime, endTime] = timeRange.split('-');
        
        return AvailabilitySlot.create({
          meetingId,
          userId: req.user.id,
          date: dateStr,
          startTime,
          endTime
        });
      })
    );
    
    // Update participant response status
    if (participant) {
      await participant.update({ hasResponded: true });
    }
    
    res.status(200).json({
      success: true,
      message: 'Availability submitted successfully',
      availableTimeSlots: slots.map(slot => `${slot.date}T${slot.startTime}-${slot.endTime}`),
    });
  } catch (error) {
    console.error('Error submitting availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit availability',
      error: error.message,
    });
  }
};

// Schedule a meeting at a specific time
exports.scheduleMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { timeSlot } = req.body; // Format: "YYYY-MM-DDThh:mm-hh:mm"
    
    // Parse the time slot
    const [dateStr, timeRange] = timeSlot.split('T');
    const [startTime, endTime] = timeRange.split('-');
    
    // Find the meeting with participants
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        { 
          model: User, 
          as: 'organizer' 
        },
        { 
          model: Participant,
          include: [User]
        }
      ]
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Check if user is the organizer
    if (meeting.organizerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the organizer can schedule the meeting',
      });
    }
    
    // Update meeting status and scheduled date/time
    await meeting.update({
      status: 'scheduled',
      scheduledDate: dateStr,
      scheduledTime: startTime,
      scheduledEndTime: endTime // Add field for end time
    });
    
    // In a real implementation, create calendar events for all participants
    const calendar = getCalendarClient(req.user);
    
    // Create start and end datetime objects
    const startDateTime = new Date(`${dateStr}T${startTime}`);
    const endDateTime = new Date(`${dateStr}T${endTime}`);
    
    // Create attendee list with emails
    const attendees = meeting.Participants.map(participant => ({
      email: participant.email
    }));
    
    // Add organizer email
    attendees.push({ email: meeting.organizer.email });
    
    // Create calendar event
    const event = {
      summary: meeting.title,
      description: `Meeting scheduled via TimeSync app`,
      start: {
        dateTime: startDateTime.toISOString(),
      },
      end: {
        dateTime: endDateTime.toISOString(),
      },
      attendees,
      // Send invitations to all attendees
      sendUpdates: 'all'
    };
    
    // Insert the event into the calendar
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    
    // Format the response
    const formattedMeeting = {
      id: meeting.id,
      title: meeting.title,
      dateRange: `${meeting.startDate} to ${meeting.endDate}`,
      duration: `${meeting.duration} hours`,
      participants: meeting.Participants.length,
      status: meeting.status,
      organizer: meeting.organizer.email,
      participantEmails: meeting.Participants.map(p => p.email),
      scheduledDate: dateStr,
      scheduledTime: startTime,
      scheduledEndTime: endTime,
      calendarEventId: response.data.id,
      calendarEventLink: response.data.htmlLink
    };
    
    res.status(200).json({
      success: true,
      meeting: formattedMeeting,
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule meeting',
      error: error.message,
    });
  }
};

// Add more functions for updating, deleting meetings, and managing availability
// ...

// Update a meeting
exports.updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const updateData = req.body;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Check if user is the organizer
    if (meeting.organizerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the organizer can update the meeting',
      });
    }
    
    // Update the meeting data
    await meeting.update({
      title: updateData.title || meeting.title,
      startDate: updateData.startDate || meeting.startDate,
      endDate: updateData.endDate || meeting.endDate,
      duration: updateData.duration || meeting.duration,
      status: updateData.status || meeting.status,
      scheduledDate: updateData.scheduledDate || meeting.scheduledDate,
      scheduledTime: updateData.scheduledTime || meeting.scheduledTime,
      timeRangeStart: updateData.timeRange?.startTime || meeting.timeRangeStart,
      timeRangeEnd: updateData.timeRange?.endTime || meeting.timeRangeEnd,
      eventDays: updateData.eventDays || meeting.eventDays
    });
    
    // If participant emails were updated, update participants
    if (updateData.participantEmails) {
      // First, get current participants
      const currentParticipants = await Participant.findAll({
        where: { meetingId: meeting.id }
      });
      
      // Find emails to add and remove
      const currentEmails = currentParticipants.map(p => p.email);
      const emailsToAdd = updateData.participantEmails.filter(email => !currentEmails.includes(email));
      const emailsToRemove = currentEmails.filter(email => !updateData.participantEmails.includes(email));
      
      // Add new participants
      if (emailsToAdd.length > 0) {
        await Promise.all(emailsToAdd.map(async (email) => {
          const user = await User.findOne({ where: { email } });
          
          return Participant.create({
            meetingId: meeting.id,
            email,
            userId: user ? user.id : null,
            hasResponded: false
          });
        }));
      }
      
      // Remove participants no longer included
      if (emailsToRemove.length > 0) {
        await Participant.destroy({
          where: {
            meetingId: meeting.id,
            email: {
              [Op.in]: emailsToRemove
            }
          }
        });
      }
    }
    
    // Get the updated meeting with all associations
    const updatedMeeting = await Meeting.findByPk(meetingId, {
      include: [
        { 
          model: User, 
          as: 'organizer',
          attributes: ['id', 'name', 'email']
        },
        { 
          model: Participant,
          attributes: ['id', 'email', 'hasResponded']
        }
      ]
    });
    
    // Format the response
    const formattedMeeting = {
      id: updatedMeeting.id,
      title: updatedMeeting.title,
      dateRange: `${updatedMeeting.startDate} to ${updatedMeeting.endDate}`,
      duration: `${updatedMeeting.duration} minutes`,
      participants: updatedMeeting.Participants.length,
      status: updatedMeeting.status,
      organizer: updatedMeeting.organizer.email,
      participantEmails: updatedMeeting.Participants.map(p => p.email),
      scheduledDate: updatedMeeting.scheduledDate,
      scheduledTime: updatedMeeting.scheduledTime,
      timeRange: {
        startTime: updatedMeeting.timeRangeStart,
        endTime: updatedMeeting.timeRangeEnd
      },
      eventDays: updatedMeeting.eventDays,
      createdAt: updatedMeeting.createdAt,
      updatedAt: updatedMeeting.updatedAt
    };
    
    res.status(200).json({
      success: true,
      meeting: formattedMeeting,
    });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update meeting',
      error: error.message,
    });
  }
};

// Delete a meeting
exports.deleteMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Check if user is the organizer
    if (meeting.organizerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the organizer can delete the meeting',
      });
    }
    
    // First delete related records
    await Participant.destroy({
      where: { meetingId: meeting.id }
    });
    
    await AvailabilitySlot.destroy({
      where: { meetingId: meeting.id }
    });
    
    // Finally delete the meeting
    await meeting.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete meeting',
      error: error.message,
    });
  }
};

// Get available time slots for a meeting
exports.getMeetingAvailability = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        { model: Participant },
        { model: AvailabilitySlot, include: [User] }
      ]
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Process availability data
    const availabilityByDate = {};
    meeting.AvailabilitySlots.forEach(slot => {
      if (!availabilityByDate[slot.date]) {
        availabilityByDate[slot.date] = { date: slot.date, participants: 0 };
      }
      availabilityByDate[slot.date].participants++;
    });
    
    // Convert to array
    const availableSlots = Object.values(availabilityByDate);
    
    res.status(200).json({
      success: true,
      meetingId,
      availableSlots,
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability',
      error: error.message,
    });
  }
};



// Submit user availability
exports.submitAvailability = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { availableDates } = req.body;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId, {
      include: [{ model: Participant }]
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }
    
    // Check if user is a participant
    const participant = meeting.Participants.find(p => 
      p.email === req.user.email || (p.userId && p.userId === req.user.id)
    );
    
    if (!participant && meeting.organizerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this meeting',
      });
    }
    
    // Delete previous availability submissions by this user
    await AvailabilitySlot.destroy({
      where: {
        meetingId,
        userId: req.user.id
      }
    });
    
    // Create new availability slots
    const slots = await Promise.all(
      availableDates.map(date => {
        return AvailabilitySlot.create({
          meetingId,
          userId: req.user.id,
          date,
          startTime: meeting.timeRangeStart,
          endTime: meeting.timeRangeEnd
        });
      })
    );
    
    // Update participant response status
    if (participant) {
      await participant.update({ hasResponded: true });
    }
    
    res.status(200).json({
      success: true,
      message: 'Availability submitted successfully',
      availableDates: slots.map(slot => slot.date),
    });
    }
    catch (error) {
    console.error('Error submitting availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit availability',
      error: error.message,
    });
    }
    }


    // Schedule a meeting at a specific time
exports.scheduleMeeting = async (req, res) => {
    try {
      const { meetingId } = req.params;
      const { scheduledDate, scheduledTime } = req.body;
      
      // Find the meeting with participants
      const meeting = await Meeting.findByPk(meetingId, {
        include: [
          { 
            model: User, 
            as: 'organizer' 
          },
          { 
            model: Participant,
            include: [User]
          }
        ]
      });
      
      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found',
        });
      }
      
      // Check if user is the organizer
      if (meeting.organizerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Only the organizer can schedule the meeting',
        });
      }
      
      // Update meeting status and scheduled date/time
      await meeting.update({
        status: 'scheduled',
        scheduledDate,
        scheduledTime
      });
      
      // In a real implementation, create calendar events for all participants
      const calendar = getCalendarClient(req.user);
      
      // Create start and end times
      const [hours, minutes] = scheduledTime.split(':');
      
      const startDate = new Date(`${scheduledDate}T${scheduledTime}`);
      
      const endDate = new Date(startDate);
      const durationMinutes = meeting.duration;
      endDate.setMinutes(endDate.getMinutes() + durationMinutes);
      
      // Create attendee list with emails
      const attendees = meeting.Participants.map(participant => ({
        email: participant.email
      }));
      
      // Add organizer email
      attendees.push({ email: meeting.organizer.email });
      
      // Create calendar event
      const event = {
        summary: meeting.title,
        description: `Meeting scheduled via TimeSync app`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'UTC',
        },
        attendees,
        // Send invitations to all attendees
        sendUpdates: 'all'
      };
      
      // Insert the event into the calendar
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
      
      // Get the updated meeting with all associations
      const updatedMeeting = await Meeting.findByPk(meetingId, {
        include: [
          { 
            model: User, 
            as: 'organizer',
            attributes: ['id', 'name', 'email']
          },
          { 
            model: Participant,
            attributes: ['id', 'email', 'hasResponded']
          }
        ]
      });
      
      // Format the response
      const formattedMeeting = {
        id: updatedMeeting.id,
        title: updatedMeeting.title,
        dateRange: `${updatedMeeting.startDate} to ${updatedMeeting.endDate}`,
        duration: `${updatedMeeting.duration} minutes`,
        participants: updatedMeeting.Participants.length,
        status: updatedMeeting.status,
        organizer: updatedMeeting.organizer.email,
        participantEmails: updatedMeeting.Participants.map(p => p.email),
        scheduledDate: updatedMeeting.scheduledDate,
        scheduledTime: updatedMeeting.scheduledTime,
        calendarEventId: response.data.id,
        calendarEventLink: response.data.htmlLink
      };
      
      res.status(200).json({
        success: true,
        meeting: formattedMeeting,
      });
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to schedule meeting',
        error: error.message,
      });
    }
  };

  // Send invitations to participants
exports.inviteParticipants = async (req, res) => {
    try {
      const { meetingId } = req.params;
      const { emails } = req.body;
      
      // Find the meeting
      const meeting = await Meeting.findByPk(meetingId);
      
      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found'
        });
      }
      
      // Check if user is the organizer
      if (meeting.organizerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Only the organizer can send invitations'
        });
      }
      
      // Create a single meeting invitation link
      const invitation = await MeetingInvitation.create({ meetingId });
      const invitationUrl = `${process.env.FRONTEND_URL}/meetings/join/${invitation.token}`;
      
      // Add participants and send emails
      const results = await Promise.all(
        emails.map(async (email) => {
          // Check if participant already exists
          let participant = await Participant.findOne({
            where: { meetingId, email }
          });
          
          if (!participant) {
            // Check if a user with this email exists
            const user = await User.findOne({ where: { email } });
            
            // Create participant
            participant = await Participant.create({
              meetingId,
              email,
              userId: user ? user.id : null,
              invitationStatus: 'pending'
            });
          }
          
          // Send invitation email
          const emailSent = await sendInvitationEmail(
            email,
            meeting,
            `${invitationUrl}?email=${encodeURIComponent(email)}&token=${participant.token}`
          );
          
          return {
            email,
            participantId: participant.id,
            emailSent
          };
        })
      );
      
      res.status(200).json({
        success: true,
        message: 'Invitations sent',
        invitationUrl,
        participants: results
      });
    } catch (error) {
      console.error('Error inviting participants:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send invitations',
        error: error.message
      });
    }
  };