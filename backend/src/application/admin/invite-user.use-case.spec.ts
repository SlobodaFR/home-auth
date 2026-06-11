import { User } from '../../domain/user/user';
import { InMemoryUserRepository } from '../test/in-memory-repositories';
import { InviteUserUseCase } from './invite-user.use-case';

describe('InviteUserUseCase', () => {
  it('creates a non-admin user', async () => {
    const userRepository = new InMemoryUserRepository();
    const useCase = new InviteUserUseCase(userRepository);

    const user = await useCase.execute({ email: 'Bob@Example.com', name: 'Bob' });

    expect(user.email).toBe('bob@example.com');
    expect(user.isAdmin).toBe(false);
    expect(await userRepository.findByEmail('bob@example.com')).not.toBeNull();
  });

  it('rejects an already-existing email', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'bob@example.com',
        name: 'Bob',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const useCase = new InviteUserUseCase(userRepository);

    await expect(useCase.execute({ email: 'bob@example.com', name: 'Bob' })).rejects.toThrow(
      'User bob@example.com already exists',
    );
  });
});
