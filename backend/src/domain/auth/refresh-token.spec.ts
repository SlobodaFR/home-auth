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
});
