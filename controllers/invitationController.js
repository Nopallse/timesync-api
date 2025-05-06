const { Meeting, Participant, MeetingInvitation, User, AvailabilitySlot } = require('../models');
const { sendEmail } = require('../utils/emailService'); // You'll need to implement this

// Generate a new meeting invitation link
exports.generateInvitation = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Check if user is the meeting organizer
    const meeting = await Meeting.findByPk(meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    if (meeting.organizerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the organizer can generate invitation links'
      });
    }
    
    // Create a new invitation
    const invitation = await MeetingInvitation.create({
      meetingId
    });
    
    // Create the invitation URL
    const invitationUrl = `${process.env.FRONTEND_URL}/meetings/join/${invitation.token}`;
    
    res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        token: invitation.token,
        url: invitationUrl,
        expiresAt: invitation.expiresAt
      }
    });
  } catch (error) {
    console.error('Error generating invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invitation',
      error: error.message
    });
  }
};

// Join a meeting via invitation link
exports.joinMeeting = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find the invitation
    const invitation = await MeetingInvitation.findOne({
      where: { token },
      include: [Meeting]
    });
    
    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation link'
      });
    }
    
    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invitation link has expired'
      });
    }
    
    // Get the meeting details
    const meeting = invitation.Meeting;
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    // Check if the user is already authenticated
    let participantData = null;
    
    if (req.isAuthenticated()) {
      // Check if this user is already a participant
      const existingParticipant = await Participant.findOne({
        where: {
          meetingId: meeting.id,
          userId: req.user.id
        }
      });
      
      if (!existingParticipant) {
        // Add the user as a participant
        await Participant.create({
          meetingId: meeting.id,
          email: req.user.email,
          userId: req.user.id,
          invitationStatus: 'accepted'
        });
      } else {
        // Update the existing participant
        await existingParticipant.update({
          invitationStatus: 'accepted'
        });
      }
      
      participantData = {
        email: req.user.email,
        isAuthenticated: true
      };
    }
    
    // Format the meeting data
    const formattedMeeting = {
      id: meeting.id,
      title: meeting.title,
      dateRange: `${meeting.startDate} to ${meeting.endDate}`,
      duration: `${meeting.duration} minutes`,
      status: meeting.status,
      scheduledDate: meeting.scheduledDate,
      scheduledTime: meeting.scheduledTime,
      timeRange: {
        startTime: meeting.timeRangeStart,
        endTime: meeting.timeRangeEnd
      }
    };
    
    res.status(200).json({
      success: true,
      meeting: formattedMeeting,
      participant: participantData,
      invitation: {
        token: invitation.token
      }
    });
  } catch (error) {
    console.error('Error joining meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join meeting',
      error: error.message
    });
  }
};

// Submit availability for a meeting
exports.submitAvailability = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { availableDates, email, participantToken } = req.body;
    
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    let participant;
    
    // Check if the user is authenticated
    if (req.isAuthenticated()) {
      // Find participant by user ID
      participant = await Participant.findOne({
        where: {
          meetingId,
          userId: req.user.id
        }
      });
      
      // If not found, check by email
      if (!participant) {
        participant = await Participant.findOne({
          where: {
            meetingId,
            email: req.user.email
          }
        });
      }
      
      // If still not found, create a new participant
      if (!participant) {
        participant = await Participant.create({
          meetingId,
          email: req.user.email,
          userId: req.user.id,
          hasResponded: true,
          invitationStatus: 'accepted'
        });
      }
    } else if (participantToken) {
      // Find participant by token
      participant = await Participant.findOne({
        where: {
          token: participantToken
        }
      });
      
      if (!participant || participant.meetingId !== meetingId) {
        return res.status(403).json({
          success: false,
          message: 'Invalid participant token'
        });
      }
    } else if (email) {
      // Find participant by email
      participant = await Participant.findOne({
        where: {
          meetingId,
          email
        }
      });
      
      if (!participant) {
        // Create a new participant with the provided email
        participant = await Participant.create({
          meetingId,
          email,
          hasResponded: true,
          invitationStatus: 'accepted'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Email or participant token is required'
      });
    }
    
    // Delete any existing availability entries for this participant
    await AvailabilitySlot.destroy({
      where: {
        meetingId,
        userId: participant.userId || null,
        participantId: participant.id
      }
    });
    
    // Create new availability entries
    const availabilitySlots = await Promise.all(
      availableDates.map(date => {
        return AvailabilitySlot.create({
          meetingId,
          userId: participant.userId || null,
          participantId: participant.id,
          date,
          startTime: meeting.timeRangeStart,
          endTime: meeting.timeRangeEnd
        });
      })
    );
    
    // Update participant response status
    await participant.update({
      hasResponded: true,
      invitationStatus: 'accepted'
    });
    
    res.status(200).json({
      success: true,
      message: 'Availability submitted successfully',
      availableDates,
      participantToken: participant.token
    });
  } catch (error) {
    console.error('Error submitting availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit availability',
      error: error.message
    });
  }
};

// Respond to a meeting invitation (accept/decline)
exports.respondToInvitation = async (req, res) => {
  try {
    const { participantToken } = req.params;
    const { response } = req.body;
    
    if (!['accepted', 'declined'].includes(response)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid response. Expected "accepted" or "declined"'
      });
    }
    
    // Find the participant by token
    const participant = await Participant.findOne({
      where: { token: participantToken },
      include: [Meeting]
    });
    
    if (!participant) {
      return res.status(404).json({
        success: false,
        message: 'Invalid participant token'
      });
    }
    
    // Update the participant's invitation status
    await participant.update({
      invitationStatus: response
    });
    
    const meeting = participant.Meeting;
    
    res.status(200).json({
      success: true,
      message: `Invitation ${response} successfully`,
      meeting: {
        id: meeting.id,
        title: meeting.title
      },
      participantEmail: participant.email
    });
  } catch (error) {
    console.error('Error responding to invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to invitation',
      error: error.message
    });
  }
};