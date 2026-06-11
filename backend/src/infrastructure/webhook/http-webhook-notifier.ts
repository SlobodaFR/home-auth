import { Injectable } from '@nestjs/common';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';

const TIMEOUT_MS = 2000;

@Injectable()
export class HttpWebhookNotifier extends WebhookNotifier {
  async notify(url: string, payload: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Webhook request failed (${response.status})`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
