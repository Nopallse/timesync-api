const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Meeting = require('./meetingModel');
const crypto = require('crypto');

const MeetingInvitation = sequelize.define('MeetingInvitation', {
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
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: () => crypto.randomBytes(20).toString('hex')
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: () => {
      const date = new Date();
      date.setDate(date.getDate() + 30); // 30 days expiration by default
      return date;
    }
  },
  hasBeenUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true
});

// Define associations
MeetingInvitation.belongsTo(Meeting);
Meeting.hasMany(MeetingInvitation);

module.exports = MeetingInvitation;