import { MagicLinkToken } from './magic-link-token';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class MagicLinkTokenRepository {
  abstract save(token: MagicLinkToken): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
}
