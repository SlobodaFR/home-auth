import { RefreshToken } from './refresh-token';

const baseProps = {
  id: 'token-1',
  tokenHash: 'hash',
  userId: 'user-1',
  clientId: 'budget',
};

describe('RefreshToken', () => {
  it('expires 30 days after issuance', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const token = RefreshToken.issue({ ...baseProps, createdAt });

    expect(token.isExpired(new Date('2024-01-30T23:59:59Z'))).toBe(false);
    expect(token.isExpired(new Date('2024-01-31T00:00:01Z'))).toBe(true);
  });

  it('starts its own family unless one is given, not rotated', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');

    const alone = RefreshToken.issue({ ...baseProps, createdAt });
    const inFamily = RefreshToken.issue({
      ...baseProps,
      createdAt,
      familyId: 'family-1',
    });

    expect(alone.familyId).toBe('token-1');
    expect(alone.rotatedAt).toBeNull();
    expect(inFamily.familyId).toBe('family-1');
  });
});
