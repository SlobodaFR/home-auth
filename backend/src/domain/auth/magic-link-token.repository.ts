import { MagicLinkToken } from './magic-link-token';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class MagicLinkTokenRepository {
  abstract save(token: MagicLinkToken): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
  /**
   * Number of tokens issued for `email` at or after `since`. Backs the
   * per-email magic-link budget: any purge of old tokens must keep at least
   * the budget window (1 hour), or the budget silently shrinks.
   */
  abstract countIssuedSince(email: string, since: Date): Promise<number>;
  /** Deletes the tokens whose expiry is before `date`; returns how many were deleted. */
  abstract deleteExpiredBefore(date: Date): Promise<number>;
}
