const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail({ to, subject, html, replyTo }) {
  const sendPromise = transporter.sendMail({
    from: `"009 Compliance" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    ...(replyTo ? { replyTo } : {}),
    html
  });

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Email send timed out. Check SMTP access and credentials.'));
    }, 25000);
  });

  try { await Promise.race([sendPromise, timeoutPromise]); } finally { clearTimeout(timer); }
}

module.exports = { sendEmail };
