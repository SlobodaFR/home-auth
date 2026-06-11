import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailMessage, EmailSender } from '../../domain/shared/email-sender';

const RESEND_API_URL = 'https://api.resend.com/emails';

@Injectable()
export class ResendEmailSender extends EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM', 'Auth Service <onboarding@resend.dev>');

    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY is not set; skipping email to ${message.to}`);
      return;
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend API request failed (${response.status}): ${body}`);
    }
  }
}
