import { AuthorizationCode } from './authorization-code';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class AuthorizationCodeRepository {
  abstract save(code: AuthorizationCode): Promise<void>;
  abstract findByCodeHash(codeHash: string): Promise<AuthorizationCode | null>;
  /**
   * Atomically marks an unused, unexpired code as used. Returns false when another request
   * redeemed it first (or it expired): the single-use guarantee lives here, not in a read-then-write.
   */
  abstract markRedeemed(codeHash: string, now: Date): Promise<boolean>;
  /** Deletes the tokens whose expiry is before `date`; returns how many were deleted. */
  abstract deleteExpiredBefore(date: Date): Promise<number>;
}
