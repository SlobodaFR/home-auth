import { User } from './user';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findAll(): Promise<User[]>;
  abstract save(user: User): Promise<void>;
  abstract count(): Promise<number>;
}
