import { AuthorizationCode } from './authorization-code';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class AuthorizationCodeRepository {
  abstract save(code: AuthorizationCode): Promise<void>;
  abstract findByCodeHash(codeHash: string): Promise<AuthorizationCode | null>;
  /** Deletes the tokens whose expiry is before `date`; returns how many were deleted. */
  abstract deleteExpiredBefore(date: Date): Promise<number>;
}
