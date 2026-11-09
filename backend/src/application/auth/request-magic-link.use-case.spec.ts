import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { User } from '../../domain/user/user';
import {
  FakeConfigService,
  FakeEmailSender,
  InMemoryMagicLinkTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { RequestMagicLinkUseCase } from './request-magic-link.use-case';

function createUseCase(config: Record<string, string> = {}) {
  const userRepository = new InMemoryUserRepository();
  const magicLinkTokenRepository = new InMemoryMagicLinkTokenRepository();
  const emailSender = new FakeEmailSender();
  const useCase = new RequestMagicLinkUseCase(
    userRepository,
    magicLinkTokenRepository,
    emailSender,
    new FakeConfigService(config) as never,
  );
  return { useCase, userRepository, magicLinkTokenRepository, emailSender };
}

describe('RequestMagicLinkUseCase', () => {
  it('sends a magic link to an existing user', async () => {
    const { useCase, userRepository, emailSender } = createUseCase();
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

    await useCase.execute('Alice@Example.com');

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe('alice@example.com');
  });

  it('does not send a link or create a user for an unknown email', async () => {
    const { useCase, userRepository, emailSender } = createUseCase();

    await useCase.execute('unknown@example.com');

    expect(emailSender.sent).toHaveLength(0);
    expect(await userRepository.findByEmail('unknown@example.com')).toBeNull();
  });

  it('bootstraps the admin user on first request from ADMIN_EMAIL', async () => {
    const { useCase, userRepository, emailSender } = createUseCase({
      ADMIN_EMAIL: 'admin@example.com',
    });

    await useCase.execute('admin@example.com');

    const admin = await userRepository.findByEmail('admin@example.com');
    expect(admin?.isAdmin).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
  });

  it('does not bootstrap the admin again once users already exist', async () => {
    const { useCase, userRepository, emailSender } = createUseCase({
      ADMIN_EMAIL: 'admin@example.com',
    });
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'someone@example.com',
        name: 'Someone',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );

    await useCase.execute('admin@example.com');

    expect(await userRepository.findByEmail('admin@example.com')).toBeNull();
    expect(emailSender.sent).toHaveLength(0);
  });

  describe('per-email budget', () => {
    const HOUR_MS = 60 * 60 * 1000;

    async function createWithAlice() {
      const deps = createUseCase();
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
      return deps;
    }

    function issueAt(email: string, issuedAt: Date, n: number): MagicLinkToken {
      return MagicLinkToken.issue({
        id: `old-${String(n)}`,
        email,
        tokenHash: `hash-${email}-${String(n)}`,
        issuedAt,
      });
    }

    it('silently stops sending once 10 links were issued for the email in the last hour', async () => {
      const { useCase, emailSender, magicLinkTokenRepository } =
        await createWithAlice();
      for (let i = 0; i < 10; i++) {
        await useCase.execute('alice@example.com');
      }

      await expect(
        useCase.execute('Alice@Example.com'),
      ).resolves.toBeUndefined();

      expect(emailSender.sent).toHaveLength(10);
      expect(
        await magicLinkTokenRepository.countIssuedSince(
          'alice@example.com',
          new Date(Date.now() - HOUR_MS),
        ),
      ).toBe(10);
    });

    it('ignores links issued more than an hour ago', async () => {
      const { useCase, emailSender, magicLinkTokenRepository } =
        await createWithAlice();
      const longAgo = new Date(Date.now() - HOUR_MS - 1000);
      for (let i = 0; i < 10; i++) {
        await magicLinkTokenRepository.save(
          issueAt('alice@example.com', longAgo, i),
        );
      }

      await useCase.execute('alice@example.com');

      expect(emailSender.sent).toHaveLength(1);
    });

    it('sends the 10th link of the hour', async () => {
      const { useCase, emailSender, magicLinkTokenRepository } =
        await createWithAlice();
      const recently = new Date(Date.now() - HOUR_MS / 2);
      for (let i = 0; i < 9; i++) {
        await magicLinkTokenRepository.save(
          issueAt('alice@example.com', recently, i),
        );
      }

      await useCase.execute('alice@example.com');

      expect(emailSender.sent).toHaveLength(1);
    });

    it('does not count links issued for other emails', async () => {
      const { useCase, emailSender, magicLinkTokenRepository } =
        await createWithAlice();
      for (let i = 0; i < 10; i++) {
        await magicLinkTokenRepository.save(
          issueAt('bob@example.com', new Date(), i),
        );
      }

      await useCase.execute('alice@example.com');

      expect(emailSender.sent).toHaveLength(1);
    });
  });
});
