const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./userModel');

const Meeting = sequelize.define('Meeting', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER, // duration in minutes
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'scheduled', 'cancelled'),
    defaultValue: 'pending'
  },
  scheduledDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  scheduledTime: {
    type: DataTypes.TIME,
    allowNull: true
  },
  organizerId: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  timeRangeStart: {
    type: DataTypes.TIME,
    allowNull: true
  },
  timeRangeEnd: {
    type: DataTypes.TIME,
    allowNull: true
  },
  eventDays: {
    type: DataTypes.INTEGER, // 5 for Mon-Fri, 7 for all days
    defaultValue: 5
  }
}, {
  timestamps: true
});

// Define association: a Meeting belongs to a User (organizer)
Meeting.belongsTo(User, { as: 'organizer', foreignKey: 'organizerId' });

module.exports = Meeting;