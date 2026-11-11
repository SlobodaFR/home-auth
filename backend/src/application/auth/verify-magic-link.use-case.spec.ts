import { randomUUID } from 'crypto';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import {
  FakeSessionService,
  FakeTelemetry,
  InMemoryMagicLinkTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { VerifyMagicLinkUseCase } from './verify-magic-link.use-case';

describe('VerifyMagicLinkUseCase', () => {
  function createUseCase() {
    const userRepository = new InMemoryUserRepository();
    const magicLinkTokenRepository = new InMemoryMagicLinkTokenRepository();
    const sessionService = new FakeSessionService();
    const telemetry = new FakeTelemetry();
    const useCase = new VerifyMagicLinkUseCase(
      magicLinkTokenRepository,
      userRepository,
      sessionService,
      telemetry,
    );
    return { useCase, userRepository, magicLinkTokenRepository, telemetry };
  }

  it('consumes a valid token and returns a session token', async () => {
    const { useCase, userRepository, magicLinkTokenRepository, telemetry } =
      createUseCase();
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const rawToken = 'raw-token';
    await magicLinkTokenRepository.save(
      MagicLinkToken.issue({
        id: randomUUID(),
        email: 'alice@example.com',
        tokenHash: hashToken(rawToken),
      }),
    );

    const result = await useCase.execute(rawToken);

    expect(result.userId).toBe('user-1');
    expect(result.sessionToken).toBe('session:user-1');
    expect(telemetry.captured).toEqual([
      {
        event: {
          name: 'login_succeeded',
          properties: { method: 'magic_link' },
        },
        userId: 'user-1',
      },
    ]);
  });

  it('rejects an unknown token', async () => {
    const { useCase, telemetry } = createUseCase();
    await expect(useCase.execute('unknown')).rejects.toThrow(
      'Lien de connexion invalide',
    );
    expect(telemetry.captured).toEqual([
      {
        event: { name: 'magic_link_failed', properties: { reason: 'invalid' } },
      },
    ]);
  });

  it('reports an expired token', async () => {
    const { useCase, magicLinkTokenRepository, telemetry } = createUseCase();
    await magicLinkTokenRepository.save(
      MagicLinkToken.issue({
        id: randomUUID(),
        email: 'alice@example.com',
        tokenHash: hashToken('old-token'),
        issuedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      }),
    );

    await expect(useCase.execute('old-token')).rejects.toThrow(
      'Magic link expired',
    );
    expect(telemetry.captured).toEqual([
      {
        event: { name: 'magic_link_failed', properties: { reason: 'expired' } },
      },
    ]);
  });

  it('rejects an already-consumed token', async () => {
    const { useCase, userRepository, magicLinkTokenRepository, telemetry } =
      createUseCase();
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const rawToken = 'raw-token';
    await magicLinkTokenRepository.save(
      MagicLinkToken.issue({
        id: randomUUID(),
        email: 'alice@example.com',
        tokenHash: hashToken(rawToken),
      }),
    );
    await useCase.execute(rawToken);

    await expect(useCase.execute(rawToken)).rejects.toThrow(
      'Magic link already used',
    );
    expect(telemetry.names()).toEqual(['login_succeeded', 'magic_link_failed']);
    expect(telemetry.captured[1].event).toEqual({
      name: 'magic_link_failed',
      properties: { reason: 'used' },
    });
  });
});
