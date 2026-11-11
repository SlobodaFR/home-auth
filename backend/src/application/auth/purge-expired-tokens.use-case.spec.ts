import { AuthorizationCode } from '../../domain/auth/authorization-code';
import {
  LINK_BUDGET_WINDOW_MS,
  MagicLinkToken,
} from '../../domain/auth/magic-link-token';
import { RefreshToken } from '../../domain/auth/refresh-token';
import {
  InMemoryAuthorizationCodeRepository,
  InMemoryMagicLinkTokenRepository,
  InMemoryRefreshTokenRepository,
} from '../test/in-memory-repositories';
import {
  AUTHORIZATION_CODE_RETENTION_MS,
  MAGIC_LINK_RETENTION_MS,
  PurgeExpiredTokensUseCase,
} from './purge-expired-tokens.use-case';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const NOW = new Date('2026-11-11T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function createUseCase() {
  const magicLinks = new InMemoryMagicLinkTokenRepository();
  const codes = new InMemoryAuthorizationCodeRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const useCase = new PurgeExpiredTokensUseCase(
    magicLinks,
    codes,
    refreshTokens,
  );
  return { useCase, magicLinks, codes, refreshTokens };
}

const link = (id: string, issuedAt: Date) =>
  MagicLinkToken.issue({ id, email: 'a@b.c', tokenHash: `h-${id}`, issuedAt });
const code = (codeHash: string, issuedAt: Date) =>
  AuthorizationCode.issue({
    codeHash,
    userId: 'u',
    clientId: 'c',
    redirectUri: 'https://c/cb',
    issuedAt,
  });
const refresh = (id: string, createdAt: Date) =>
  RefreshToken.issue({
    id,
    tokenHash: `r-${id}`,
    userId: 'u',
    clientId: 'c',
    createdAt,
  });

describe('PurgeExpiredTokensUseCase', () => {
  it('keeps magic links at least as long as the per-email budget window', () => {
    expect(MAGIC_LINK_RETENTION_MS).toBeGreaterThanOrEqual(
      LINK_BUDGET_WINDOW_MS,
    );
  });

  it('deletes tokens past their retention and keeps the others', async () => {
    const { useCase, magicLinks, codes, refreshTokens } = createUseCase();
    await magicLinks.save(link('old', ago(8 * DAY)));
    await magicLinks.save(link('recent', ago(2 * DAY)));
    await codes.save(code('old', ago(2 * DAY)));
    await codes.save(code('recent', ago(MINUTE)));
    await refreshTokens.save(refresh('expired', ago(31 * DAY)));
    await refreshTokens.save(refresh('valid', ago(DAY)));

    const result = await useCase.execute(NOW);

    expect(result).toEqual({
      magicLinks: 1,
      authorizationCodes: 1,
      refreshTokens: 1,
    });
    expect(await magicLinks.findByTokenHash('h-old')).toBeNull();
    expect(await magicLinks.findByTokenHash('h-recent')).not.toBeNull();
    expect(await codes.findByCodeHash('old')).toBeNull();
    expect(await codes.findByCodeHash('recent')).not.toBeNull();
    expect(await refreshTokens.findByTokenHash('r-expired')).toBeNull();
    expect(await refreshTokens.findByTokenHash('r-valid')).not.toBeNull();
  });

  it('keeps an expired magic link still inside the budget window', async () => {
    const { useCase, magicLinks } = createUseCase();
    await magicLinks.save(link('fifty-min', ago(50 * MINUTE)));

    await useCase.execute(NOW);

    expect(
      await magicLinks.countIssuedSince('a@b.c', ago(LINK_BUDGET_WINDOW_MS)),
    ).toBe(1);
  });

  it('applies the documented retentions', () => {
    expect(MAGIC_LINK_RETENTION_MS).toBe(7 * DAY);
    expect(AUTHORIZATION_CODE_RETENTION_MS).toBe(DAY);
  });
});
