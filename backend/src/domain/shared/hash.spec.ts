import { hashSecret, hashToken, verifySecret } from './hash';

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('def'));
  });
});

describe('hashSecret / verifySecret', () => {
  it('verifies a matching secret', () => {
    const hash = hashSecret('s3cret');
    expect(verifySecret('s3cret', hash)).toBe(true);
  });

  it('rejects a non-matching secret', () => {
    const hash = hashSecret('s3cret');
    expect(verifySecret('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same input (random salt)', () => {
    expect(hashSecret('s3cret')).not.toBe(hashSecret('s3cret'));
  });

  it('rejects a malformed stored hash', () => {
    expect(verifySecret('s3cret', 'not-a-valid-hash')).toBe(false);
  });
});
