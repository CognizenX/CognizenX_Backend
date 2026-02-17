const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
// Default to gmail, but allow override
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'gmail';

const transporter = nodemailer.createTransport({
  service: EMAIL_SERVICE,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS ? EMAIL_PASS.replace(/\s+/g, '') : '',
  },
});

async function sendPasswordReset(to, link) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('EMAIL_USER or EMAIL_PASS not set; logging link only.');
    console.log('Reset Link:', link);
    return;
  }

  const mailOptions = {
    from: EMAIL_USER,
    to,
    subject: 'Reset your password',
    text: `Click the following link to reset your password: ${link}`,
    html: `
      <p>Hello,</p>
      <p>Click the link below to reset your password. If you did not request this, you can safely ignore this email.</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>If the button doesn't work, copy and paste this URL into your browser:</p>
      <p>${link}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${to}`);
  } catch (err) {
    console.error('Error sending email via Nodemailer:', err);
    throw err;
  }
}

module.exports = { sendPasswordReset };
