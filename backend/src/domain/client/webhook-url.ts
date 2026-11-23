/**
 * Entry rule for a client logout webhook (contract PC6): https only, no credentials in the
 * URL. A query string stays allowed during the transition (apps still read `?secret=`).
 * The message never echoes the URL, which may carry that secret.
 */
export function assertSecureWebhookUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid URL for the logout webhook');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('Webhook URL must not contain credentials');
  }
}
