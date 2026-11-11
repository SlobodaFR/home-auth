import { User } from '../../domain/user/user';
import {
  FakeAvatarStorage,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { UploadAvatarUseCase } from './upload-avatar.use-case';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);

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

    await useCase.execute('user-1', PNG);

    expect((await userRepository.findById('user-1'))?.avatarKey).toBe(
      'auth-avatars/test/user-1',
    );
  });

  // The type comes from the content, not from what the client declared.
  it('stores the detected image type', async () => {
    const { useCase, userRepository, avatarStorage } = createUseCase();
    await seedUser(userRepository);

    await useCase.execute('user-1', PNG);

    expect(
      (await avatarStorage.get('auth-avatars/test/user-1'))?.contentType,
    ).toBe('image/png');
  });

  it('rejects content that is not a JPEG, PNG or WebP image, and stores nothing', async () => {
    const { useCase, userRepository, avatarStorage } = createUseCase();
    await seedUser(userRepository);

    await expect(
      useCase.execute('user-1', Buffer.from('<html><script>x</script>')),
    ).rejects.toThrow('Avatar must be a JPEG, PNG or WebP image');
    expect(await avatarStorage.get('auth-avatars/test/user-1')).toBeNull();
  });

  it('rejects an avatar over 2MB', async () => {
    const { useCase, userRepository } = createUseCase();
    await seedUser(userRepository);

    await expect(
      useCase.execute(
        'user-1',
        Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]),
      ),
    ).rejects.toThrow('Avatar must not exceed 2MB');
  });
});
