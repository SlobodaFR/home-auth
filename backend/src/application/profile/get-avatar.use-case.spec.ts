import { User } from '../../domain/user/user';
import { FakeAvatarStorage, InMemoryUserRepository } from '../test/in-memory-repositories';
import { GetAvatarUseCase } from './get-avatar.use-case';

describe('GetAvatarUseCase', () => {
  function createUseCase() {
    const userRepository = new InMemoryUserRepository();
    const avatarStorage = new FakeAvatarStorage();
    const useCase = new GetAvatarUseCase(userRepository, avatarStorage);
    return { useCase, userRepository, avatarStorage };
  }

  it('returns a fallback when the user has no avatar', async () => {
    const { useCase, userRepository } = createUseCase();
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

    const result = await useCase.execute('user-1');

    expect(result).toEqual({ kind: 'fallback', displayName: 'Alice' });
  });

  it('returns the stored avatar when present', async () => {
    const { useCase, userRepository, avatarStorage } = createUseCase();
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: 'auth-avatars/test/user-1',
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    await avatarStorage.upload('user-1', { contentType: 'image/png', body: Buffer.from('image') });

    const result = await useCase.execute('user-1');

    expect(result).toEqual({ kind: 'stored', avatar: { contentType: 'image/png', body: Buffer.from('image') } });
  });

  it('falls back to the avatar key lookup miss', async () => {
    const { useCase, userRepository } = createUseCase();
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: 'auth-avatars/test/missing',
        isAdmin: false,
        createdAt: new Date(),
      }),
    );

    const result = await useCase.execute('user-1');

    expect(result).toEqual({ kind: 'fallback', displayName: 'Alice' });
  });

  it('rejects an unknown user', async () => {
    const { useCase } = createUseCase();
    await expect(useCase.execute('unknown')).rejects.toThrow('User unknown not found');
  });
});
