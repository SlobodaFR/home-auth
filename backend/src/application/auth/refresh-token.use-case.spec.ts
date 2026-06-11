import { randomUUID } from 'crypto';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { Client } from '../../domain/client/client';
import { hashSecret, hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import {
  FakeTokenService,
  InMemoryClientRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { RefreshTokenUseCase } from './refresh-token.use-case';

const RAW_SECRET = 's3cret';
const RAW_REFRESH_TOKEN = 'raw-refresh-token';

describe('RefreshTokenUseCase', () => {
  function createUseCase() {
    const clientRepository = new InMemoryClientRepository();
    const refreshTokenRepository = new InMemoryRefreshTokenRepository();
    const userRepository = new InMemoryUserRepository();
    const tokenService = new FakeTokenService();
    const useCase = new RefreshTokenUseCase(clientRepository, refreshTokenRepository, userRepository, tokenService);
    return { useCase, clientRepository, refreshTokenRepository, userRepository };
  }

  async function seed(deps: ReturnType<typeof createUseCase>, expiresAt?: Date) {
    await deps.clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: hashSecret(RAW_SECRET),
        redirectUris: ['https://budget.example.com/auth/callback'],
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
    const token = expiresAt
      ? RefreshToken.fromPersistence({
          id: randomUUID(),
          tokenHash: hashToken(RAW_REFRESH_TOKEN),
          userId: 'user-1',
          clientId: 'budget',
          createdAt: new Date(),
          expiresAt,
        })
      : RefreshToken.issue({
          id: randomUUID(),
          tokenHash: hashToken(RAW_REFRESH_TOKEN),
          userId: 'user-1',
          clientId: 'budget',
          createdAt: new Date(),
        });
    await deps.refreshTokenRepository.save(token);
  }

  it('rotates the refresh token and issues a new access token', async () => {
    const deps = createUseCase();
    await seed(deps);

    const result = await deps.useCase.execute({
      refreshToken: RAW_REFRESH_TOKEN,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
    });

    expect(result.refreshToken).not.toBe(RAW_REFRESH_TOKEN);
    expect(await deps.refreshTokenRepository.findByTokenHash(hashToken(RAW_REFRESH_TOKEN))).toBeNull();
    expect(await deps.refreshTokenRepository.findByTokenHash(hashToken(result.refreshToken))).not.toBeNull();
  });

  it('rejects an invalid client secret', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({ refreshToken: RAW_REFRESH_TOKEN, clientId: 'budget', clientSecret: 'wrong' }),
    ).rejects.toThrow('Invalid client credentials');
  });

  it('rejects an unknown refresh token', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({ refreshToken: 'unknown', clientId: 'budget', clientSecret: RAW_SECRET }),
    ).rejects.toThrow('Invalid refresh token');
  });

  it('rejects and deletes an expired refresh token', async () => {
    const deps = createUseCase();
    await seed(deps, new Date(Date.now() - 1000));

    await expect(
      deps.useCase.execute({ refreshToken: RAW_REFRESH_TOKEN, clientId: 'budget', clientSecret: RAW_SECRET }),
    ).rejects.toThrow('Refresh token expired');
    expect(await deps.refreshTokenRepository.findByTokenHash(hashToken(RAW_REFRESH_TOKEN))).toBeNull();
  });
});
