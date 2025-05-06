const nodemailer = require('nodemailer');

// Setup transporter for sending emails (configure based on your email provider)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Send an invitation email
exports.sendInvitationEmail = async (email, meeting, invitationUrl) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Meeting Invitation: ${meeting.title}`,
      html: `
        <h1>You've been invited to a meeting</h1>
        <h2>${meeting.title}</h2>
        <p>You are invited to participate in scheduling a meeting.</p>
        <p><strong>Date Range:</strong> ${meeting.startDate} to ${meeting.endDate}</p>
        <p><strong>Duration:</strong> ${meeting.duration} minutes</p>
        <p>Please click the link below to view the meeting and provide your availability:</p>
        <a href="${invitationUrl}" style="display:inline-block;padding:10px 20px;background-color:#4f46e5;color:white;text-decoration:none;border-radius:4px;">View Meeting</a>
        <p>This invitation link will expire on ${new Date(meeting.expiresAt).toLocaleDateString()}.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Send a notification email when a meeting is scheduled
exports.sendMeetingScheduledEmail = async (email, meeting, calendarEventLink) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Meeting Scheduled: ${meeting.title}`,
      html: `
        <h1>Your meeting has been scheduled</h1>
        <h2>${meeting.title}</h2>
        <p><strong>Date:</strong> ${meeting.scheduledDate}</p>
        <p><strong>Time:</strong> ${meeting.scheduledTime}</p>
        <p><strong>Duration:</strong> ${meeting.duration} minutes</p>
        <p>This event has been added to your calendar.</p>
        ${calendarEventLink ? `<p><a href="${calendarEventLink}">View in Calendar</a></p>` : ''}
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Generic send email function
exports.sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};