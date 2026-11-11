import { Logger } from '@nestjs/common';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { EmailMessage, EmailSender } from '../../domain/shared/email-sender';
import { pseudonymize } from '../../domain/shared/pseudonymize';
import { User } from '../../domain/user/user';
import {
  FakeConfigService,
  FakeEmailSender,
  FakeTelemetry,
  InMemoryMagicLinkTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { RequestMagicLinkUseCase } from './request-magic-link.use-case';

const PSEUDONYM_SECRET = 'p'.repeat(64);

function createUseCase(
  overrides: Record<string, string> = {},
  emailSender: EmailSender = new FakeEmailSender(),
) {
  const config = { PSEUDONYM_SECRET, ...overrides };
  const userRepository = new InMemoryUserRepository();
  const magicLinkTokenRepository = new InMemoryMagicLinkTokenRepository();
  const telemetry = new FakeTelemetry();
  const useCase = new RequestMagicLinkUseCase(
    userRepository,
    magicLinkTokenRepository,
    emailSender,
    new FakeConfigService(config) as never,
    telemetry,
  );
  return {
    useCase,
    userRepository,
    magicLinkTokenRepository,
    emailSender: emailSender as FakeEmailSender,
    telemetry,
  };
}

/** Sender whose delivery never completes, or fails, like a slow or broken Resend. */
class StubEmailSender extends EmailSender {
  readonly attempted: EmailMessage[] = [];
  constructor(private readonly outcome: 'hang' | 'reject' | 'throw') {
    super();
  }

  send(message: EmailMessage): Promise<void> {
    this.attempted.push(message);
    if (this.outcome === 'throw') {
      // A non-async implementation failing before it returns a promise.
      throw new Error('boom');
    }
    return this.outcome === 'hang'
      ? new Promise(() => undefined)
      : Promise.reject(
          new Error('Resend API request failed (403): alice@example.com'),
        );
  }
}

const ALICE = () =>
  User.create({
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    avatarKey: null,
    isAdmin: false,
    createdAt: new Date(),
  });

describe('RequestMagicLinkUseCase email delivery (#24)', () => {
  afterEach(() => jest.restoreAllMocks());

  // A known email must not take longer than an unknown one: delivery runs in the background.
  it('returns without waiting for the email to be delivered', async () => {
    const sender = new StubEmailSender('hang');
    const { useCase, userRepository, magicLinkTokenRepository } = createUseCase(
      {},
      sender,
    );
    await userRepository.save(ALICE());

    await useCase.execute('alice@example.com');

    expect(sender.attempted).toHaveLength(1);
    expect(
      await magicLinkTokenRepository.countIssuedSince(
        'alice@example.com',
        new Date(Date.now() - 60_000),
      ),
    ).toBe(1);
  }, 1000);

  it('also contains a sender that throws before returning a promise', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { useCase, userRepository } = createUseCase(
      {},
      new StubEmailSender('throw'),
    );
    await userRepository.save(ALICE());

    await expect(useCase.execute('alice@example.com')).resolves.toBeUndefined();
    await new Promise(setImmediate);

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('logs a failed delivery without the address and without an unhandled rejection', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const { useCase, userRepository } = createUseCase(
      {},
      new StubEmailSender('reject'),
    );
    await userRepository.save(ALICE());

    try {
      await expect(
        useCase.execute('alice@example.com'),
      ).resolves.toBeUndefined();
      await new Promise(setImmediate);

      expect(error).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(error.mock.calls)).toContain(
        'Magic link email delivery failed',
      );
      expect(JSON.stringify(error.mock.calls)).not.toContain(
        'alice@example.com',
      );
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

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

  it('reports the outcome, identifying only known users', async () => {
    const { useCase, userRepository, telemetry } = createUseCase();
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

    await useCase.execute('unknown@example.com');
    await useCase.execute('alice@example.com');

    expect(telemetry.captured).toEqual([
      {
        event: {
          name: 'magic_link_requested',
          properties: { outcome: 'unknown' },
        },
      },
      {
        event: {
          name: 'magic_link_requested',
          properties: { outcome: 'sent' },
        },
        userId: 'user-1',
      },
    ]);
  });

  it('logs an unknown email only as its pseudonym', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const { useCase } = createUseCase();

    await useCase.execute('Unknown@Example.com');

    const logged = JSON.stringify(log.mock.calls);
    expect(logged.toLowerCase()).not.toContain('unknown@example.com');
    expect(logged).toContain(
      pseudonymize('unknown@example.com', PSEUDONYM_SECRET),
    );
    log.mockRestore();
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
      const { useCase, emailSender, magicLinkTokenRepository, telemetry } =
        await createWithAlice();
      for (let i = 0; i < 10; i++) {
        await useCase.execute('alice@example.com');
      }

      await expect(
        useCase.execute('Alice@Example.com'),
      ).resolves.toBeUndefined();
      expect(telemetry.captured.at(-1)).toEqual({
        event: {
          name: 'magic_link_requested',
          properties: { outcome: 'budget_exhausted' },
        },
        userId: 'user-1',
      });

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
