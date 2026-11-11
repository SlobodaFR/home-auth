import { Injectable } from '@nestjs/common';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Must stay >= LINK_BUDGET_WINDOW_MS: the per-email budget counts these rows. */
export const MAGIC_LINK_RETENTION_MS = 7 * DAY_MS;
export const AUTHORIZATION_CODE_RETENTION_MS = DAY_MS;

export interface PurgeResult {
  magicLinks: number;
  authorizationCodes: number;
  refreshTokens: number;
}

/** Deletes single-use tokens long past their expiry so tables (and the Litestream replica) stop growing. */
@Injectable()
export class PurgeExpiredTokensUseCase {
  constructor(
    private readonly magicLinkTokenRepository: MagicLinkTokenRepository,
    private readonly authorizationCodeRepository: AuthorizationCodeRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(now: Date = new Date()): Promise<PurgeResult> {
    const before = (retentionMs: number) =>
      new Date(now.getTime() - retentionMs);
    return {
      magicLinks: await this.magicLinkTokenRepository.deleteExpiredBefore(
        before(MAGIC_LINK_RETENTION_MS),
      ),
      authorizationCodes:
        await this.authorizationCodeRepository.deleteExpiredBefore(
          before(AUTHORIZATION_CODE_RETENTION_MS),
        ),
      // Expired refresh tokens are useless: no extra retention.
      refreshTokens: await this.refreshTokenRepository.deleteExpiredBefore(now),
    };
  }
}
