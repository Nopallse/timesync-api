const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Meeting = require('./meetingModel');
const User = require('./userModel');

const AvailabilitySlot = sequelize.define('AvailabilitySlot', {
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
  userId: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false
  }
}, {
  timestamps: true
});

// Define associations
AvailabilitySlot.belongsTo(Meeting);
AvailabilitySlot.belongsTo(User);
Meeting.hasMany(AvailabilitySlot);
User.hasMany(AvailabilitySlot);

module.exports = AvailabilitySlot;