import { AuthorizationCode } from './authorization-code';

const baseProps = {
  codeHash: 'hash',
  userId: 'user-1',
  clientId: 'budget',
  redirectUri: 'https://budget.example.com/auth/callback',
};

describe('AuthorizationCode', () => {
  it('expires 60 seconds after issuance', () => {
    const issuedAt = new Date('2024-01-01T00:00:00Z');
    const code = AuthorizationCode.issue({ ...baseProps, issuedAt });

    expect(code.isExpired(new Date('2024-01-01T00:00:59Z'))).toBe(false);
    expect(code.isExpired(new Date('2024-01-01T00:01:01Z'))).toBe(true);
  });

  it('redeem marks the code as used', () => {
    const issuedAt = new Date('2024-01-01T00:00:00Z');
    const code = AuthorizationCode.issue({ ...baseProps, issuedAt });

    const redeemed = code.redeem(new Date('2024-01-01T00:00:30Z'));
    expect(redeemed.used).toBe(true);
    expect(code.used).toBe(false);
  });

  it('rejects redeeming an already-used code', () => {
    const code = AuthorizationCode.fromPersistence({
      ...baseProps,
      expiresAt: new Date('2024-01-01T00:01:00Z'),
      used: true,
    });

    expect(() => code.redeem(new Date('2024-01-01T00:00:30Z'))).toThrow('Authorization code already used');
  });

  it('rejects redeeming an expired code', () => {
    const code = AuthorizationCode.fromPersistence({
      ...baseProps,
      expiresAt: new Date('2024-01-01T00:01:00Z'),
      used: false,
    });

    expect(() => code.redeem(new Date('2024-01-01T00:01:01Z'))).toThrow('Authorization code expired');
  });
});
