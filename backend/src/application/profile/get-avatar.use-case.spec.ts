import { User } from '../../domain/user/user';
import {
  FakeAvatarStorage,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { GetAvatarUseCase } from './get-avatar.use-case';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

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
    await avatarStorage.upload('user-1', {
      contentType: 'image/png',
      body: PNG,
    });

    const result = await useCase.execute('user-1');

    expect(result).toEqual({
      kind: 'stored',
      avatar: { contentType: 'image/png', body: PNG },
    });
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

  it.each([
    ['Maison (test)', 'alice@example.com', 'Maison test'],
    ['Capucine CAPOËN', 'alice@example.com', 'Capucine CAPOËN'],
    ['(—)', 'alice@example.com', 'aliceexamplecom'],
  ])(
    'keeps only letters, digits and spaces of %s for the generated avatar',
    async (name, email, displayName) => {
      const { useCase, userRepository } = createUseCase();
      await userRepository.save(
        User.create({
          id: 'user-1',
          email,
          name,
          avatarKey: null,
          isAdmin: false,
          createdAt: new Date(),
        }),
      );

      expect(await useCase.execute('user-1')).toEqual({
        kind: 'fallback',
        displayName,
      });
    },
  );

  // Avatars stored before type detection may not be images: never serve them.
  it('falls back to the generated avatar when the stored content is not an allowed image', async () => {
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
    await avatarStorage.upload('user-1', {
      contentType: 'image/png',
      body: Buffer.from('<html>x</html>'),
    });

    expect(await useCase.execute('user-1')).toEqual({
      kind: 'fallback',
      displayName: 'Alice',
    });
  });

  it('serves the detected type rather than the stored one', async () => {
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
    await avatarStorage.upload('user-1', {
      contentType: 'text/html',
      body: PNG,
    });

    expect(await useCase.execute('user-1')).toEqual({
      kind: 'stored',
      avatar: { contentType: 'image/png', body: PNG },
    });
  });

  it('rejects an unknown user', async () => {
    const { useCase } = createUseCase();
    await expect(useCase.execute('unknown')).rejects.toThrow(
      'User unknown not found',
    );
  });
});
