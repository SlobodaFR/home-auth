import { BadRequestException } from '@nestjs/common';
import { assertSecureWebhookUrl } from '../../domain/client/webhook-url';

/** Domain rule (https, no credentials) reported to the admin as a 400. */
export function ensureSecureWebhookUrl(url: string): void {
  try {
    assertSecureWebhookUrl(url);
  } catch (error: unknown) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid webhook URL',
    );
  }
}
