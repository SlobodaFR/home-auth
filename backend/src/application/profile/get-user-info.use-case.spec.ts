import { User } from '../../domain/user/user';
import { FakeConfigService, InMemoryUserRepository } from '../test/in-memory-repositories';
import { GetUserInfoUseCase } from './get-user-info.use-case';

describe('GetUserInfoUseCase', () => {
  it('returns the user profile with an avatar URL', async () => {
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
    const useCase = new GetUserInfoUseCase(
      userRepository,
      new FakeConfigService({ AUTH_BASE_URL: 'https://auth.example.com' }) as never,
    );

    const result = await useCase.execute('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: 'https://auth.example.com/avatars/user-1',
    });
  });

  it('rejects an unknown user', async () => {
    const userRepository = new InMemoryUserRepository();
    const useCase = new GetUserInfoUseCase(userRepository, new FakeConfigService() as never);

    await expect(useCase.execute('unknown')).rejects.toThrow('User unknown not found');
  });
});
