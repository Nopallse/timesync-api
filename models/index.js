const User = require('./userModel');
const Meeting = require('./meetingModel');
const Participant = require('./participantModel');
const AvailabilitySlot = require('./availabilitySlotModel');
const MeetingInvitation = require('./meetingInvitationModel');
const sequelize = require('../config/database');

// Define any additional associations if needed

// Sync all models with the database
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Error synchronizing database:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Meeting,
  Participant,
  AvailabilitySlot,
  MeetingInvitation,
  syncDatabase
};