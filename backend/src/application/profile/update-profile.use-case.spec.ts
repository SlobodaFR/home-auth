import { User } from '../../domain/user/user';
import { InMemoryUserRepository } from '../test/in-memory-repositories';
import { UpdateProfileUseCase } from './update-profile.use-case';

describe('UpdateProfileUseCase', () => {
  const baseUser = () =>
    User.create({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      avatarKey: null,
      isAdmin: false,
      createdAt: new Date(),
    });

  it('updates the user name', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.save(baseUser());
    const useCase = new UpdateProfileUseCase(userRepository);

    await useCase.execute('user-1', { name: 'Alice Smith' });

    expect((await userRepository.findById('user-1'))?.name).toBe('Alice Smith');
  });

  it('updates the country code', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.save(baseUser());
    const useCase = new UpdateProfileUseCase(userRepository);

    await useCase.execute('user-1', { countryCode: 'FR' });

    expect((await userRepository.findById('user-1'))?.countryCode).toBe('FR');
  });

  it('updates the locale', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.save(baseUser());
    const useCase = new UpdateProfileUseCase(userRepository);

    await useCase.execute('user-1', { locale: 'fr-FR' });

    expect((await userRepository.findById('user-1'))?.locale).toBe('fr-FR');
  });

  it('updates multiple fields at once', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.save(baseUser());
    const useCase = new UpdateProfileUseCase(userRepository);

    await useCase.execute('user-1', { name: 'Alice Smith', countryCode: 'US', locale: 'en-US' });

    const updated = await userRepository.findById('user-1');
    expect(updated?.name).toBe('Alice Smith');
    expect(updated?.countryCode).toBe('US');
    expect(updated?.locale).toBe('en-US');
  });

  it('clears country code when null is passed', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.save(baseUser().withCountryCode('FR'));
    const useCase = new UpdateProfileUseCase(userRepository);

    await useCase.execute('user-1', { countryCode: null });

    expect((await userRepository.findById('user-1'))?.countryCode).toBeNull();
  });

  it('rejects an unknown user', async () => {
    const useCase = new UpdateProfileUseCase(new InMemoryUserRepository());
    await expect(useCase.execute('unknown', { name: 'Name' })).rejects.toThrow('User unknown not found');
  });
});
