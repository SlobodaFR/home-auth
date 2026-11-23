import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import { isIP } from 'net';
import {
  createPinnedLookup,
  isPublicAddress,
  NOT_PUBLIC_MESSAGE,
  PinnedLookup,
  Resolver,
} from './webhook-target-policy';

/** TOTAL budget for one delivery: DNS, connection, TLS and response (contract PC6). */
export const WEBHOOK_TOTAL_TIMEOUT_MS = 2000;

export interface WebhookRequestOptions {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  lookup: PinnedLookup;
  signal: AbortSignal;
}

export interface WebhookDeliveryDeps {
  /** Overridable for tests only; the defaults implement the policy. */
  lookup: Resolver;
  isPublicAddress: (address: string) => boolean;
  request: (url: URL, options: WebhookRequestOptions) => Promise<number>;
  timeoutMs: number;
}

/**
 * One POST, no redirect followed, no retry. A non-public target is refused before any
 * connection: IP literals are checked directly (net does not call `lookup` for them), host
 * names through a pinned lookup (every resolved address checked, only those connected to).
 * Resolves on a 2xx, rejects otherwise. Messages never contain the URL (it may carry a secret).
 */
export async function deliverWebhook(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  deps: Partial<WebhookDeliveryDeps> = {},
): Promise<void> {
  const isPublic = deps.isPublicAddress ?? isPublicAddress;
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0 && !isPublic(host)) {
    throw new Error(NOT_PUBLIC_MESSAGE);
  }

  const signal = AbortSignal.timeout(
    deps.timeoutMs ?? WEBHOOK_TOTAL_TIMEOUT_MS,
  );
  let status: number;
  try {
    status = await (deps.request ?? nodeRequest)(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body,
      lookup: createPinnedLookup(deps.lookup, isPublic),
      signal,
    });
  } catch (error: unknown) {
    if (signal.aborted) {
      throw new Error('Webhook request timed out', { cause: error });
    }
    throw error;
  }
  if (status < 200 || status >= 300) {
    throw new Error(`Webhook request failed (${String(status)})`);
  }
}

function nodeRequest(
  url: URL,
  options: WebhookRequestOptions,
): Promise<number> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(url, {
      method: options.method,
      headers: options.headers,
      lookup: options.lookup,
      signal: options.signal,
      // No pooled socket may outlive the checks made for this very delivery.
      agent: false,
    });
    req.on('error', reject);
    req.on('response', (res: IncomingMessage) => {
      // Only the status matters: never wait for (or keep) the body.
      res.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.end(options.body);
  });
}
