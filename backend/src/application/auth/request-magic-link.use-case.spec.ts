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
    const { useCase, userRepository, emailSender } = createUseCase({ ADMIN_EMAIL: 'admin@example.com' });

    await useCase.execute('admin@example.com');

    const admin = await userRepository.findByEmail('admin@example.com');
    expect(admin?.isAdmin).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
  });

  it('does not bootstrap the admin again once users already exist', async () => {
    const { useCase, userRepository, emailSender } = createUseCase({ ADMIN_EMAIL: 'admin@example.com' });
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
});
