import { RefreshToken } from './refresh-token';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class RefreshTokenRepository {
  abstract save(token: RefreshToken): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract findAllForUser(userId: string): Promise<RefreshToken[]>;
  abstract deleteById(id: string): Promise<void>;
  abstract deleteAllForUser(userId: string): Promise<void>;
}
