import { Injectable } from '@nestjs/common';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';
import { deliverWebhook } from './secure-webhook-request';
import { buildWebhookRequest } from './webhook-request-builder';

@Injectable()
export class HttpWebhookNotifier extends WebhookNotifier {
  async notify(
    url: string,
    payload: Record<string, unknown>,
    secrets: readonly string[],
  ): Promise<void> {
    const { body, headers } = buildWebhookRequest(payload, secrets);
    await deliverWebhook(url, body, headers);
  }
}
