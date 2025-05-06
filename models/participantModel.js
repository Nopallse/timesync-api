const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Meeting = require('./meetingModel');
const User = require('./userModel');
const crypto = require('crypto');

const Participant = sequelize.define('Participant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  meetingId: {
    type: DataTypes.UUID,
    references: {
      model: Meeting,
      key: 'id'
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: User,
      key: 'id'
    }
  },
  hasResponded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: () => crypto.randomBytes(20).toString('hex')
  },
  invitationStatus: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined'),
    defaultValue: 'pending'
  }
}, {
  timestamps: true
});

// Define associations
Participant.belongsTo(Meeting);
Meeting.hasMany(Participant);
Participant.belongsTo(User);

module.exports = Participant;