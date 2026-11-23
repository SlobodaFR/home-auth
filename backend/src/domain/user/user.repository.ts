import { User } from './user';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findAll(): Promise<User[]>;
  /** Never writes sessionVersion: only revokeSessions changes it, so a stale save cannot undo a revocation. */
  abstract save(user: User): Promise<void>;
  /** Atomically increments the user's sessionVersion; false when the user does not exist. */
  abstract revokeSessions(userId: string): Promise<boolean>;
  abstract count(): Promise<number>;
}
