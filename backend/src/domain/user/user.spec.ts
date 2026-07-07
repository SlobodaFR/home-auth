import { User } from './user';

const baseProps = {
  id: 'user-1',
  email: 'Alice@Example.com',
  name: '  Alice  ',
  avatarKey: null,
  isAdmin: false,
  countryCode: null,
  locale: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

describe('User', () => {
  it('normalizes email to lowercase and trims name', () => {
    const user = User.create(baseProps);
    expect(user.email).toBe('alice@example.com');
    expect(user.name).toBe('Alice');
  });

  it('rejects an invalid email', () => {
    expect(() => User.create({ ...baseProps, email: 'not-an-email' })).toThrow('Invalid email address');
  });

  it('rejects an empty name', () => {
    expect(() => User.create({ ...baseProps, name: '   ' })).toThrow('Name must not be empty');
  });

  it('rename returns a new User with the updated name', () => {
    const user = User.create(baseProps);
    const renamed = user.rename('Bob');
    expect(renamed.name).toBe('Bob');
    expect(user.name).toBe('Alice');
  });

  it('withAvatarKey returns a new User with the avatar key set', () => {
    const user = User.create(baseProps);
    const withAvatar = user.withAvatarKey('auth-avatars/dev/user-1');
    expect(withAvatar.avatarKey).toBe('auth-avatars/dev/user-1');
    expect(user.avatarKey).toBeNull();
  });

  it('withAdmin returns a new User with the admin flag set', () => {
    const user = User.create(baseProps);
    const admin = user.withAdmin(true);
    expect(admin.isAdmin).toBe(true);
    expect(user.isAdmin).toBe(false);
  });

  it('accepts valid ISO 3166-1 alpha-2 country code', () => {
    const user = User.create({ ...baseProps, countryCode: 'FR' });
    expect(user.countryCode).toBe('FR');
  });

  it('rejects an invalid country code', () => {
    expect(() => User.create({ ...baseProps, countryCode: 'fr' })).toThrow('Invalid country code');
    expect(() => User.create({ ...baseProps, countryCode: 'FRA' })).toThrow('Invalid country code');
    expect(() => User.create({ ...baseProps, countryCode: '12' })).toThrow('Invalid country code');
  });

  it('accepts a null country code', () => {
    const user = User.create({ ...baseProps, countryCode: null });
    expect(user.countryCode).toBeNull();
  });

  it('accepts valid BCP 47 locale', () => {
    const user = User.create({ ...baseProps, locale: 'fr-FR' });
    expect(user.locale).toBe('fr-FR');
  });

  it('accepts a language-only locale', () => {
    const user = User.create({ ...baseProps, locale: 'en' });
    expect(user.locale).toBe('en');
  });

  it('rejects an invalid locale', () => {
    expect(() => User.create({ ...baseProps, locale: 'invalid locale!' })).toThrow('Invalid locale');
  });

  it('accepts a null locale', () => {
    const user = User.create({ ...baseProps, locale: null });
    expect(user.locale).toBeNull();
  });

  it('withCountryCode returns a new User with the country code set', () => {
    const user = User.create(baseProps);
    const updated = user.withCountryCode('US');
    expect(updated.countryCode).toBe('US');
    expect(user.countryCode).toBeNull();
  });

  it('withLocale returns a new User with the locale set', () => {
    const user = User.create(baseProps);
    const updated = user.withLocale('en-US');
    expect(updated.locale).toBe('en-US');
    expect(user.locale).toBeNull();
  });
});
