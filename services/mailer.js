const sgMail = require('@sendgrid/mail');

const FROM = process.env.SENDGRID_FROM_EMAIL;
const API_KEY = process.env.SENDGRID_API_KEY;

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

async function sendPasswordReset(to, link) {
  if (!API_KEY) {
    console.warn('SENDGRID_API_KEY is not set; skipping email send. Link:', link);
    return;
  }
  if (!FROM) throw new Error('SENDGRID_FROM_EMAIL is not configured');

  const msg = {
    to,
    from: FROM,
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
  await sgMail.send(msg);
}

module.exports = { sendPasswordReset };
