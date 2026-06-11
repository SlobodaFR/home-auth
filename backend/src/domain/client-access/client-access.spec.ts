import { ClientAccess } from './client-access';

describe('ClientAccess', () => {
  it('creates a valid access entry', () => {
    const access = ClientAccess.create({ userId: 'user-1', clientId: 'budget' });
    expect(access.userId).toBe('user-1');
    expect(access.clientId).toBe('budget');
  });

  it('rejects an empty userId', () => {
    expect(() => ClientAccess.create({ userId: '', clientId: 'budget' })).toThrow(
      'userId and clientId must not be empty',
    );
  });

  it('rejects an empty clientId', () => {
    expect(() => ClientAccess.create({ userId: 'user-1', clientId: '' })).toThrow(
      'userId and clientId must not be empty',
    );
  });
});
