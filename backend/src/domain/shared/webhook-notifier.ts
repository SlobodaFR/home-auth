/**
 * Port (driven side) implemented by the infrastructure layer. Best-effort
 * HTTP notification (short timeout, no retry, failures are not propagated).
 */
export abstract class WebhookNotifier {
  /**
   * `secrets`: the client's active HMAC keys (current, plus the previous one during the
   * overlap). Every one signs the delivery; none means an unsigned delivery.
   */
  abstract notify(
    url: string,
    payload: Record<string, unknown>,
    secrets: readonly string[],
  ): Promise<void>;
}
