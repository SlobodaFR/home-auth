import { randomUUID } from 'crypto';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import {
  FakeSessionService,
  InMemoryMagicLinkTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { VerifyMagicLinkUseCase } from './verify-magic-link.use-case';

describe('VerifyMagicLinkUseCase', () => {
  function createUseCase() {
    const userRepository = new InMemoryUserRepository();
    const magicLinkTokenRepository = new InMemoryMagicLinkTokenRepository();
    const sessionService = new FakeSessionService();
    const useCase = new VerifyMagicLinkUseCase(magicLinkTokenRepository, userRepository, sessionService);
    return { useCase, userRepository, magicLinkTokenRepository };
  }

  it('consumes a valid token and returns a session token', async () => {
    const { useCase, userRepository, magicLinkTokenRepository } = createUseCase();
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
      MagicLinkToken.issue({ id: randomUUID(), email: 'alice@example.com', tokenHash: hashToken(rawToken) }),
    );

    const result = await useCase.execute(rawToken);

    expect(result.userId).toBe('user-1');
    expect(result.sessionToken).toBe('session:user-1');
  });

  it('rejects an unknown token', async () => {
    const { useCase } = createUseCase();
    await expect(useCase.execute('unknown')).rejects.toThrow('Lien de connexion invalide');
  });

  it('rejects an already-consumed token', async () => {
    const { useCase, userRepository, magicLinkTokenRepository } = createUseCase();
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
      MagicLinkToken.issue({ id: randomUUID(), email: 'alice@example.com', tokenHash: hashToken(rawToken) }),
    );
    await useCase.execute(rawToken);

    await expect(useCase.execute(rawToken)).rejects.toThrow('Magic link already used');
  });
});
