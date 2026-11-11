import { isIP } from 'net';

/**
 * Anonymous product/debug telemetry. Every event and property listed here leaves the system:
 * never add personal data (emails, IPs, tokens, raw URLs, raw ids). Users are identified only by
 * a pseudonym computed by the adapter.
 */
export type TelemetryEvent =
  | {
      name: 'magic_link_requested';
      properties: { outcome: 'sent' | 'unknown' | 'budget_exhausted' };
    }
  | {
      name: 'magic_link_failed';
      properties: { reason: 'expired' | 'used' | 'invalid' };
    }
  | { name: 'login_succeeded'; properties: { method: 'magic_link' } }
  | {
      name: 'authorize';
      // client_id only once the client is resolved: before that it is caller-supplied free text.
      properties:
        | { outcome: 'code' | 'forbidden'; client_id: string }
        | { outcome: 'login_required' | 'unknown_client' | 'invalid_request' };
    }
  | {
      name: 'token_exchanged';
      properties: {
        client_id: string;
        grant_type: 'authorization_code' | 'refresh_token';
      };
    }
  | {
      name: 'runtime_health';
      properties: {
        lag_p50_ms: number;
        lag_p99_ms: number;
        lag_max_ms: number;
        elu: number;
        heap_used_mb: number;
        rss_mb: number;
      };
    }
  | { name: 'rate_limited'; properties: { route: string } }
  | { name: 'server_error'; properties: { route: string; error_name: string } }
  | {
      name: 'http_request';
      properties: {
        route: string;
        method: string;
        status: number;
        duration_ms: number;
      };
    };

/**
 * Port (driven side). Fire-and-forget: synchronous, and never throws into the caller.
 * `userId` is the raw user id: the adapter pseudonymizes it, so it never leaves the system.
 * Without it, the event is anonymous.
 */
export abstract class Telemetry {
  abstract capture(event: TelemetryEvent, userId?: string): void;
}

const FORBIDDEN_KEYS = new Set([
  'email',
  'ip',
  'token',
  'code',
  'secret',
  'client_secret',
  'cookie',
  'authorization',
]);

const SENSITIVE_VALUE_PATTERNS = [
  /@/, // email
  /[0-9a-f]{32,}/i, // tokens, codes, hashes
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // user, token or code ids
  /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/, // JWT
];

function isSafeValue(value: unknown): boolean {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value !== 'string') {
    return false; // objects, arrays, null: they could nest anything
  }
  return (
    isIP(value) === 0 &&
    !SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

/** Last line of defense: drops any property whose key or value looks like personal or secret data. */
export function sanitizeTelemetryProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        !FORBIDDEN_KEYS.has(key.toLowerCase()) && isSafeValue(value),
    ),
  );
}
