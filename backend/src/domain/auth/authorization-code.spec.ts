import { AuthorizationCode } from './authorization-code';

const baseProps = {
  codeHash: 'hash',
  userId: 'user-1',
  clientId: 'budget',
  redirectUri: 'https://budget.example.com/auth/callback',
  codeChallenge: null,
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

    expect(() => code.redeem(new Date('2024-01-01T00:00:30Z'))).toThrow(
      'Authorization code already used',
    );
  });

  it('rejects redeeming an expired code', () => {
    const code = AuthorizationCode.fromPersistence({
      ...baseProps,
      expiresAt: new Date('2024-01-01T00:01:00Z'),
      used: false,
    });

    expect(() => code.redeem(new Date('2024-01-01T00:01:01Z'))).toThrow(
      'Authorization code expired',
    );
  });
});

describe('AuthorizationCode PKCE', () => {
  const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  const issue = (codeChallenge?: string | null) =>
    AuthorizationCode.issue({
      codeHash: 'h',
      userId: 'u',
      clientId: 'c',
      redirectUri: 'https://c/cb',
      codeChallenge,
    });

  it('stores the challenge, or null without one', () => {
    expect(issue(CHALLENGE).codeChallenge).toBe(CHALLENGE);
    expect(issue().codeChallenge).toBeNull();
  });

  it('accepts the matching verifier only', () => {
    expect(issue(CHALLENGE).matchesVerifier(VERIFIER)).toBe(true);
    expect(issue(CHALLENGE).matchesVerifier(undefined)).toBe(false);
    expect(issue(CHALLENGE).matchesVerifier(`${VERIFIER.slice(0, -1)}x`)).toBe(
      false,
    );
  });

  it('keeps codes without PKCE working when no verifier is sent', () => {
    expect(issue().matchesVerifier(undefined)).toBe(true);
  });

  // RFC 9700 §4.8.1: a verifier without a challenge means the challenge was stripped (downgrade).
  it('refuses a non-string verifier instead of throwing', () => {
    expect(issue(CHALLENGE).matchesVerifier(null as unknown as string)).toBe(
      false,
    );
  });

  it('refuses a verifier for a code issued without challenge', () => {
    expect(issue().matchesVerifier(VERIFIER)).toBe(false);
  });
});
