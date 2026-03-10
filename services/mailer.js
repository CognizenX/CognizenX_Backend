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

/**
 * Send cron job notification email
 */
async function sendCronNotification(to, status, data = {}) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('EMAIL_USER or EMAIL_PASS not set; skipping cron notification email.');
    return;
  }

  // Convert single email to array for consistency
  const recipients = Array.isArray(to) ? to : [to];
  
  if (recipients.length === 0) {
    console.warn('No recipients specified for cron notification');
    return;
  }

  let subject, htmlContent, textContent;

  if (status === 'started') {
    subject = 'Weekly Question Generation Started';
    textContent = `
Weekly question generation has started.

Time: ${data.timestamp || new Date().toISOString()}
Week Number: ${data.weekNumber || 'N/A'}
Categories to Process: ${data.categoriesCount || 'N/A'}
Expected Questions: ${data.expectedQuestionsCount || 'N/A'}

This is an automated notification from CognizenX.
    `.trim();
    
    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">Weekly Question Generation Started</h2>
        <p>The automated weekly question generation has begun.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr style="background-color: #f2f2f2;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Time</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.timestamp || new Date().toISOString()}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Week Number</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.weekNumber || 'N/A'}</td>
          </tr>
          <tr style="background-color: #f2f2f2;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Categories to Process</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.categoriesCount || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Expected Questions</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.expectedQuestionsCount || 'N/A'}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">This is an automated notification from CognizenX.</p>
      </div>
    `;
  } else if (status === 'completed') {
    const isSuccess = data.success !== false;
    const statusText = isSuccess ? 'Completed Successfully' : 'Completed with Errors';
    const statusColor = isSuccess ? '#4CAF50' : '#f44336';

    subject = `Weekly Question Generation ${statusText}`;
    
    textContent = `
Weekly question generation has completed.

Status: ${statusText}
Time: ${data.timestamp || new Date().toISOString()}
Week Number: ${data.weekNumber || 'N/A'}
Questions Generated: ${data.totalQuestionsGenerated || 0}
Categories Processed: ${data.categoriesProcessed || 0}
Categories with Questions: ${data.categoriesWithQuestions || 0}
${data.failures > 0 ? `\nFailures: ${data.failures} categories had errors` : ''}

This is an automated notification from CognizenX.
    `.trim();
    
    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${statusColor};">Weekly Question Generation ${statusText}</h2>
        <p>The automated weekly question generation has finished.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr style="background-color: #f2f2f2;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Status</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd; color: ${statusColor};"><strong>${statusText}</strong></td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Time</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.timestamp || new Date().toISOString()}</td>
          </tr>
          <tr style="background-color: #f2f2f2;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Week Number</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.weekNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Questions Generated</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.totalQuestionsGenerated || 0}</td>
          </tr>
          <tr style="background-color: #f2f2f2;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Categories Processed</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.categoriesProcessed || 0}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Categories with Questions</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.categoriesWithQuestions || 0}</td>
          </tr>
          ${data.failures > 0 ? `
          <tr style="background-color: #fff3cd;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>⚠️ Failures</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #856404;">${data.failures} categories had errors</td>
          </tr>
          ` : ''}
        </table>
        ${data.failureDetails && data.failureDetails.length > 0 ? `
        <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #856404;">Error Details:</h3>
          <ul style="color: #856404;">
            ${data.failureDetails.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        <p style="color: #666; font-size: 12px; margin-top: 30px;">This is an automated notification from CognizenX.</p>
      </div>
    `;
  } else {
    console.error(`Unknown cron notification status: ${status}`);
    return;
  }

  const mailOptions = {
    from: EMAIL_USER,
    to: recipients.join(', '),
    subject,
    text: textContent,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Cron notification email sent to ${recipients.join(', ')}`);
  } catch (err) {
    console.error('Error sending cron notification email:', err);
    // Don't throw - we don't want email failures to stop the cron job
  }
}

/**
 * Send cron notification to configured email
 * Wrapper function that automatically gets the notification email from EMAIL_USER
 */
async function sendCronAlert(status, data = {}) {
  const notificationEmail = EMAIL_USER;
  
  if (!notificationEmail) {
    console.warn('EMAIL_USER not configured - skipping cron notification');
    return;
  }
  
  return sendCronNotification(notificationEmail, status, data);
}

module.exports = { sendPasswordReset, sendCronNotification, sendCronAlert };
