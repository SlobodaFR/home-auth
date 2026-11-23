import { RefreshToken } from './refresh-token';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class RefreshTokenRepository {
  abstract save(token: RefreshToken): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract findAllForUser(userId: string): Promise<RefreshToken[]>;
  abstract deleteById(id: string): Promise<void>;
  /**
   * Atomically sets rotated_at on a token not rotated yet. True for the single caller that
   * rotated it; false if it was already rotated (or does not exist).
   */
  abstract markRotated(id: string, at: Date): Promise<boolean>;
  /** Deletes every token of the family; returns how many were deleted. */
  abstract deleteFamily(familyId: string): Promise<number>;
  abstract deleteAllForUser(userId: string): Promise<void>;
  /** Deletes the tokens rotated before `date`; returns how many were deleted. */
  abstract deleteRotatedBefore(date: Date): Promise<number>;
  /** Deletes the tokens whose expiry is before `date`; returns how many were deleted. */
  abstract deleteExpiredBefore(date: Date): Promise<number>;
}
