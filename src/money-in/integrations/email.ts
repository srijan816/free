import { config } from '../config.js';

export interface EmailPayload {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload) {
  if (!config.sendgridApiKey) {
    console.log('[email:stub]', {
      to: payload.to,
      subject: payload.subject
    });
    return { provider: 'stub', messageId: `stub-${Date.now()}` };
  }

  // Placeholder for SendGrid integration.
  return { provider: 'sendgrid', messageId: `sg-${Date.now()}` };
}
