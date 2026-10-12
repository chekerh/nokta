import { logger } from './logger.mjs';

// Delivery for outbound transactional email. There is no bundled SMTP client, so
// the transport is injectable: production wires a real provider here, and tests
// inject a capture function. Without a transport the message is logged instead,
// which keeps local development usable (but the reset link is redacted in
// production so a token never lands in the logs).
let transport = null;

export function setMailTransport(fn) {
  transport = typeof fn === 'function' ? fn : null;
}

export function resetMailTransport() {
  transport = null;
}

async function logTransport(message) {
  if (process.env.NODE_ENV === 'production') {
    logger.warn(`[mailer] no transport configured; dropped "${message.subject}" to ${message.to}`);
    return;
  }
  logger.info(`[mailer] ${message.subject} → ${message.to}\n${message.text}`);
}

export async function sendMail(message) {
  const send = transport || logTransport;
  await send(message);
}

export async function sendPasswordResetEmail(to, resetUrl) {
  await sendMail({
    to,
    subject: 'Reset your Nokta password',
    text: [
      'A password reset was requested for your Nokta account.',
      '',
      'Open this link to choose a new password:',
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
  });
}
