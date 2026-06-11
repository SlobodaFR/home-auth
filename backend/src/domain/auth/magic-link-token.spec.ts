import { MagicLinkToken } from './magic-link-token';

const baseProps = {
  id: 'link-1',
  email: 'alice@example.com',
  tokenHash: 'hash',
};

describe('MagicLinkToken', () => {
  it('expires 15 minutes after issuance', () => {
    const issuedAt = new Date('2024-01-01T00:00:00Z');
    const token = MagicLinkToken.issue({ ...baseProps, issuedAt });

    expect(token.isExpired(new Date('2024-01-01T00:14:59Z'))).toBe(false);
    expect(token.isExpired(new Date('2024-01-01T00:15:01Z'))).toBe(true);
  });

  it('consume marks the token as consumed', () => {
    const issuedAt = new Date('2024-01-01T00:00:00Z');
    const token = MagicLinkToken.issue({ ...baseProps, issuedAt });

    const consumed = token.consume(new Date('2024-01-01T00:01:00Z'));
    expect(consumed.isConsumed()).toBe(true);
    expect(token.isConsumed()).toBe(false);
  });

  it('rejects consuming an already-consumed token', () => {
    const token = MagicLinkToken.fromPersistence({
      ...baseProps,
      expiresAt: new Date('2024-01-01T00:15:00Z'),
      consumedAt: new Date('2024-01-01T00:01:00Z'),
    });

    expect(() => token.consume(new Date('2024-01-01T00:02:00Z'))).toThrow('Magic link already used');
  });

  it('rejects consuming an expired token', () => {
    const token = MagicLinkToken.fromPersistence({
      ...baseProps,
      expiresAt: new Date('2024-01-01T00:15:00Z'),
      consumedAt: null,
    });

    expect(() => token.consume(new Date('2024-01-01T00:15:01Z'))).toThrow('Magic link expired');
  });
});
