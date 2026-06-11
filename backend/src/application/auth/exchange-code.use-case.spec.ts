import { AuthorizationCode } from '../../domain/auth/authorization-code';
import { Client } from '../../domain/client/client';
import { hashSecret, hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import {
  FakeTokenService,
  InMemoryAuthorizationCodeRepository,
  InMemoryClientRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { ExchangeCodeUseCase } from './exchange-code.use-case';

const REDIRECT_URI = 'https://budget.example.com/auth/callback';
const RAW_SECRET = 's3cret';
const RAW_CODE = 'raw-code';

describe('ExchangeCodeUseCase', () => {
  function createUseCase() {
    const clientRepository = new InMemoryClientRepository();
    const authorizationCodeRepository = new InMemoryAuthorizationCodeRepository();
    const refreshTokenRepository = new InMemoryRefreshTokenRepository();
    const userRepository = new InMemoryUserRepository();
    const tokenService = new FakeTokenService();
    const useCase = new ExchangeCodeUseCase(
      clientRepository,
      authorizationCodeRepository,
      refreshTokenRepository,
      userRepository,
      tokenService,
    );
    return { useCase, clientRepository, authorizationCodeRepository, refreshTokenRepository, userRepository };
  }

  async function seed(deps: ReturnType<typeof createUseCase>) {
    await deps.clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: hashSecret(RAW_SECRET),
        redirectUris: [REDIRECT_URI],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    await deps.userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    await deps.authorizationCodeRepository.save(
      AuthorizationCode.issue({
        codeHash: hashToken(RAW_CODE),
        userId: 'user-1',
        clientId: 'budget',
        redirectUri: REDIRECT_URI,
      }),
    );
  }

  it('exchanges a valid code for an access and refresh token', async () => {
    const deps = createUseCase();
    await seed(deps);

    const result = await deps.useCase.execute({
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    });

    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(15 * 60);
    const claims = JSON.parse(result.accessToken) as { sub: string; aud: string };
    expect(claims.sub).toBe('user-1');
    expect(claims.aud).toBe('budget');

    const stored = await deps.refreshTokenRepository.findByTokenHash(hashToken(result.refreshToken));
    expect(stored?.userId).toBe('user-1');
  });

  it('rejects an invalid client secret', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({ code: RAW_CODE, clientId: 'budget', clientSecret: 'wrong', redirectUri: REDIRECT_URI }),
    ).rejects.toThrow('Invalid client credentials');
  });

  it('rejects a code already redeemed', async () => {
    const deps = createUseCase();
    await seed(deps);
    await deps.useCase.execute({ code: RAW_CODE, clientId: 'budget', clientSecret: RAW_SECRET, redirectUri: REDIRECT_URI });

    await expect(
      deps.useCase.execute({ code: RAW_CODE, clientId: 'budget', clientSecret: RAW_SECRET, redirectUri: REDIRECT_URI }),
    ).rejects.toThrow('Authorization code already used');
  });

  it('rejects a redirect_uri mismatch', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({
        code: RAW_CODE,
        clientId: 'budget',
        clientSecret: RAW_SECRET,
        redirectUri: 'https://other.example.com',
      }),
    ).rejects.toThrow('Invalid authorization code');
  });
});
