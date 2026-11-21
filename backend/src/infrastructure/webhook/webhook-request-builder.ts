import { randomUUID } from 'crypto';
import { buildWebhookSignatureHeader } from '../../domain/shared/webhook-signer';

/**
 * Body and headers of one logout webhook delivery (contract PC7). The body string is what is
 * signed AND what is sent: it must reach the wire untouched (no re-serialisation).
 */
export function buildWebhookRequest(
  payload: Record<string, unknown>,
  secrets: readonly string[],
  now: Date = new Date(),
  id: string = randomUUID(),
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(now.getTime() / 1000);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Auth-Webhook-Id': id,
    'X-Auth-Webhook-Timestamp': String(timestamp),
  };
  const signature = buildWebhookSignatureHeader(secrets, id, timestamp, body);
  if (signature !== null) {
    headers['X-Auth-Webhook-Signature'] = signature;
  }
  return { body, headers };
}
