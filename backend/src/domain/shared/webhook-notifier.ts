/**
 * Port (driven side) implemented by the infrastructure layer. Best-effort
 * HTTP notification (short timeout, no retry, failures are not propagated).
 */
export abstract class WebhookNotifier {
  abstract notify(url: string, payload: Record<string, unknown>): Promise<void>;
}
