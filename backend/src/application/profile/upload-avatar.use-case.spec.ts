import { User } from '../../domain/user/user';
import { FakeAvatarStorage, InMemoryUserRepository } from '../test/in-memory-repositories';
import { UploadAvatarUseCase } from './upload-avatar.use-case';

describe('UploadAvatarUseCase', () => {
  function createUseCase() {
    const userRepository = new InMemoryUserRepository();
    const avatarStorage = new FakeAvatarStorage();
    const useCase = new UploadAvatarUseCase(userRepository, avatarStorage);
    return { useCase, userRepository, avatarStorage };
  }

  async function seedUser(userRepository: InMemoryUserRepository) {
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
  }

  it('uploads a valid avatar and updates the user', async () => {
    const { useCase, userRepository } = createUseCase();
    await seedUser(userRepository);

    await useCase.execute('user-1', { contentType: 'image/png', body: Buffer.from('image') });

    expect((await userRepository.findById('user-1'))?.avatarKey).toBe('auth-avatars/test/user-1');
  });

  it('rejects an unsupported content type', async () => {
    const { useCase, userRepository } = createUseCase();
    await seedUser(userRepository);

    await expect(
      useCase.execute('user-1', { contentType: 'image/gif', body: Buffer.from('image') }),
    ).rejects.toThrow('Avatar must be a JPEG, PNG or WebP image');
  });

  it('rejects an avatar over 2MB', async () => {
    const { useCase, userRepository } = createUseCase();
    await seedUser(userRepository);

    await expect(
      useCase.execute('user-1', { contentType: 'image/png', body: Buffer.alloc(2 * 1024 * 1024 + 1) }),
    ).rejects.toThrow('Avatar must not exceed 2MB');
  });
});
