import { NotFoundException } from '@nestjs/common';
import { User } from '../../domain/user/user';
import { InMemoryUserRepository } from '../test/in-memory-repositories';
import { LogoutUseCase } from '../auth/logout.use-case';
import { RevokeUserSessionsUseCase } from './revoke-user-sessions.use-case';

describe('RevokeUserSessionsUseCase', () => {
  async function setup() {
    const userRepository = new InMemoryUserRepository();
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
    const logout = vi.fn<LogoutUseCase['execute']>().mockResolvedValue();
    const useCase = new RevokeUserSessionsUseCase(userRepository, {
      execute: logout,
    } as unknown as LogoutUseCase);
    return { useCase, logout };
  }

  it('runs the logout of the user (sessions, refresh tokens, webhooks)', async () => {
    const { useCase, logout } = await setup();

    await useCase.execute('u1');

    expect(logout).toHaveBeenCalledExactlyOnceWith('u1');
  });

  it('throws NotFoundException for an unknown user, without logging anything out', async () => {
    const { useCase, logout } = await setup();

    await expect(useCase.execute('nobody')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(logout).not.toHaveBeenCalled();
  });
});
