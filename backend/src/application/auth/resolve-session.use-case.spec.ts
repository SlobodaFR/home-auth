import { User } from '../../domain/user/user';
import {
  FakeSessionService,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { ResolveSessionUseCase } from './resolve-session.use-case';

describe('ResolveSessionUseCase', () => {
  async function setup() {
    const userRepository = new InMemoryUserRepository();
    const sessionService = new FakeSessionService();
    await userRepository.save(
      User.create({
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const useCase = new ResolveSessionUseCase(sessionService, userRepository);
    return { useCase, userRepository, sessionService };
  }

  it('returns the user for a valid token at the current version', async () => {
    const { useCase, sessionService } = await setup();

    const user = await useCase.execute(await sessionService.sign('u1', 0));

    expect(user?.id).toBe('u1');
  });

  it('returns null without a token', async () => {
    const { useCase } = await setup();

    expect(await useCase.execute(undefined)).toBeNull();
    expect(await useCase.execute('')).toBeNull();
  });

  it('returns null for an invalid token', async () => {
    const { useCase } = await setup();

    expect(await useCase.execute('garbage')).toBeNull();
  });

  it('returns null once the user revoked their sessions', async () => {
    const { useCase, userRepository, sessionService } = await setup();
    const token = await sessionService.sign('u1', 0);

    await userRepository.revokeSessions('u1');

    expect(await useCase.execute(token)).toBeNull();
    // A fresh login carries the new version.
    expect(
      (await useCase.execute(await sessionService.sign('u1', 1)))?.id,
    ).toBe('u1');
  });

  it('returns null when the token version is not the current one', async () => {
    const { useCase, sessionService } = await setup();

    expect(
      await useCase.execute(await sessionService.sign('u1', 7)),
    ).toBeNull();
  });

  it('returns null for a deleted user', async () => {
    const { useCase, sessionService } = await setup();

    expect(
      await useCase.execute(await sessionService.sign('gone', 0)),
    ).toBeNull();
  });

  // Transitional (PC9 D2): cookies issued before the sv claim existed are accepted as the
  // current version, until D3 makes the claim mandatory.
  it('accepts a legacy token without sv as the current version', async () => {
    const { useCase, userRepository } = await setup();
    await userRepository.revokeSessions('u1');

    expect((await useCase.execute('session:u1'))?.id).toBe('u1');
  });
});
