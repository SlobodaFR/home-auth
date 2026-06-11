import { AuthorizationCode } from './authorization-code';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class AuthorizationCodeRepository {
  abstract save(code: AuthorizationCode): Promise<void>;
  abstract findByCodeHash(codeHash: string): Promise<AuthorizationCode | null>;
}
