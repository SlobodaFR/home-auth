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
    const from = this.config.get<string>(
      'EMAIL_FROM',
      'Auth Service <onboarding@resend.dev>',
    );

    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set; skipping email');
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
      // The body can echo the recipient: keep only Resend's error name.
      throw new Error(
        `Resend API request failed (${response.status}): ${await errorName(response)}`,
      );
    }
  }
}

async function errorName(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === 'object' &&
      'name' in body &&
      typeof body.name === 'string'
    ) {
      return body.name;
    }
  } catch {
    // Not JSON: fall through.
  }
  return 'unknown_error';
}
