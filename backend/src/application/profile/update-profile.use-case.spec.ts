import { User } from '../../domain/user/user';
import { InMemoryUserRepository } from '../test/in-memory-repositories';
import { UpdateProfileUseCase } from './update-profile.use-case';

describe('UpdateProfileUseCase', () => {
  it('updates the user name', async () => {
    const userRepository = new InMemoryUserRepository();
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
    const useCase = new UpdateProfileUseCase(userRepository);

    await useCase.execute('user-1', 'Alice Smith');

    expect((await userRepository.findById('user-1'))?.name).toBe('Alice Smith');
  });

  it('rejects an unknown user', async () => {
    const useCase = new UpdateProfileUseCase(new InMemoryUserRepository());
    await expect(useCase.execute('unknown', 'Name')).rejects.toThrow('User unknown not found');
  });
});
