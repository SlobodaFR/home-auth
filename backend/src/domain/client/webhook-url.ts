export const MASK_MARKER = '?***';

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
  // `?***` is the display mask of a stored query: never a value to store.
  if (value.includes(MASK_MARKER)) {
    throw new Error('Webhook URL must not contain the mask marker');
  }
}

/**
 * What the admin API shows of a webhook URL: the query string (legacy `?secret=`), credentials
 * and fragment are hidden. A URL with nothing to hide is returned as stored.
 */
export function maskWebhookUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Unparseable legacy value (e.g. ''): show nothing rather than fail the whole listing.
    return null;
  }
  if (!url.search && !url.username && !url.password && !url.hash) {
    return value;
  }
  return `${url.origin}${url.pathname}${url.search ? MASK_MARKER : ''}`;
}
