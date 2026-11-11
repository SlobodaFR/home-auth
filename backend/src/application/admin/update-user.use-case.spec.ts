import { User } from '../../domain/user/user';
import { InMemoryUserRepository } from '../test/in-memory-repositories';
import { UpdateUserUseCase } from './update-user.use-case';

describe('UpdateUserUseCase', () => {
  async function seedUser(userRepository: InMemoryUserRepository) {
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
  }

  it('updates the name and admin flag', async () => {
    const userRepository = new InMemoryUserRepository();
    await seedUser(userRepository);
    const useCase = new UpdateUserUseCase(userRepository);

    const updated = await useCase.execute('admin-1', 'user-1', {
      name: 'Bob Smith',
      isAdmin: true,
    });

    expect(updated.name).toBe('Bob Smith');
    expect(updated.isAdmin).toBe(true);
  });

  async function seedAdmin(userRepository: InMemoryUserRepository) {
    await userRepository.save(
      User.create({
        id: 'admin-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: true,
        createdAt: new Date(),
      }),
    );
  }

  it('rejects an admin removing their own admin role', async () => {
    const userRepository = new InMemoryUserRepository();
    await seedAdmin(userRepository);
    const useCase = new UpdateUserUseCase(userRepository);

    await expect(
      useCase.execute('admin-1', 'admin-1', { isAdmin: false }),
    ).rejects.toThrow('You cannot remove your own admin role');
    expect((await userRepository.findById('admin-1'))?.isAdmin).toBe(true);
  });

  it('lets an admin rename themselves and keep their role', async () => {
    const userRepository = new InMemoryUserRepository();
    await seedAdmin(userRepository);
    const useCase = new UpdateUserUseCase(userRepository);

    const updated = await useCase.execute('admin-1', 'admin-1', {
      name: 'Alice B',
      isAdmin: true,
    });

    expect(updated.name).toBe('Alice B');
    expect(updated.isAdmin).toBe(true);
  });

  it('lets an admin remove the admin role of another admin', async () => {
    const userRepository = new InMemoryUserRepository();
    await seedAdmin(userRepository);
    await seedUser(userRepository);
    const useCase = new UpdateUserUseCase(userRepository);
    await useCase.execute('admin-1', 'user-1', { isAdmin: true });

    const updated = await useCase.execute('admin-1', 'user-1', {
      isAdmin: false,
    });

    expect(updated.isAdmin).toBe(false);
  });

  it('rejects an unknown user', async () => {
    const useCase = new UpdateUserUseCase(new InMemoryUserRepository());
    await expect(
      useCase.execute('admin-1', 'unknown', { isAdmin: true }),
    ).rejects.toThrow('User unknown not found');
  });
});
