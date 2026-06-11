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

    const updated = await useCase.execute('user-1', { name: 'Bob Smith', isAdmin: true });

    expect(updated.name).toBe('Bob Smith');
    expect(updated.isAdmin).toBe(true);
  });

  it('rejects an unknown user', async () => {
    const useCase = new UpdateUserUseCase(new InMemoryUserRepository());
    await expect(useCase.execute('unknown', { isAdmin: true })).rejects.toThrow('User unknown not found');
  });
});
