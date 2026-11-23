import { createHmac } from 'crypto';

/**
 * Logout webhook signature (contract PC7).
 * hex = HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`), the key being the secret string
 * as stored (64 hex characters, UTF-8). rawBody is the exact bytes sent.
 */
export function computeWebhookSignature(
  secret: string,
  id: string,
  timestamp: string | number,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${id}.${String(timestamp)}.${rawBody}`)
    .digest('hex');
}

/**
 * X-Auth-Webhook-Signature value: `v1=<hex>[,v1=<hex>]`, one entry per active secret (two
 * during the overlap after a regeneration). Null when there is no secret.
 */
export function buildWebhookSignatureHeader(
  secrets: readonly string[],
  id: string,
  timestamp: string | number,
  rawBody: string,
): string | null {
  if (secrets.length === 0) {
    return null;
  }
  return secrets
    .map(
      (secret) =>
        `v1=${computeWebhookSignature(secret, id, timestamp, rawBody)}`,
    )
    .join(',');
}
