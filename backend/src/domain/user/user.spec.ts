import { User } from './user';

const baseProps = {
  id: 'user-1',
  email: 'Alice@Example.com',
  name: '  Alice  ',
  avatarKey: null,
  isAdmin: false,
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
});
