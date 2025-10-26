const sgMail = require('@sendgrid/mail');

if (!process.env.SENDGRID_API_KEY) {
  console.warn('SENDGRID_API_KEY not set; sendEmail will throw when called');
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

module.exports = async function sendEmail({ to, from, subject, text, html }) {
  const msg = {
    to,
    from: from || process.env.EMAIL_FROM, // set EMAIL_FROM env
    subject,
    text,
    html,
  };
  return sgMail.send(msg);
};