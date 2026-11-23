import { Injectable } from '@nestjs/common';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';
import { deliverWebhook } from './secure-webhook-request';

@Injectable()
export class HttpWebhookNotifier extends WebhookNotifier {
  async notify(url: string, payload: Record<string, unknown>): Promise<void> {
    await deliverWebhook(url, JSON.stringify(payload), {
      'Content-Type': 'application/json',
    });
  }
}
