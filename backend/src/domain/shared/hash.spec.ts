import { scryptSync } from 'crypto';
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
  it('verifies a matching secret', async () => {
    const hash = await hashSecret('s3cret');
    await expect(verifySecret('s3cret', hash)).resolves.toBe(true);
  });

  it('rejects a non-matching secret', async () => {
    const hash = await hashSecret('s3cret');
    await expect(verifySecret('wrong', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same input (random salt)', async () => {
    expect(await hashSecret('s3cret')).not.toBe(await hashSecret('s3cret'));
  });

  it('rejects a malformed stored hash', async () => {
    await expect(verifySecret('s3cret', 'not-a-valid-hash')).resolves.toBe(
      false,
    );
  });

  // A digest of the wrong length must be a plain mismatch (401), never a timingSafeEqual RangeError (500).
  it.each([
    ['odd-length hex', 'abcd:abc'],
    ['a valid hex digest that is too short', `abcd:${'ab'.repeat(10)}`],
  ])('rejects a stored hash with %s', async (_label, stored) => {
    await expect(verifySecret('s3cret', stored)).resolves.toBe(false);
  });

  it('returns false for a null stored hash (unknown client)', async () => {
    await expect(verifySecret('x', null)).resolves.toBe(false);
  });

  // Secrets already in the database were hashed by the former scryptSync implementation.
  it('still verifies a hash produced by the former scryptSync implementation', async () => {
    const salt = '0123456789abcdef0123456789abcdef';
    const legacy = `${salt}:${scryptSync('s3cret', salt, 64).toString('hex')}`;

    await expect(verifySecret('s3cret', legacy)).resolves.toBe(true);
    await expect(verifySecret('wrong', legacy)).resolves.toBe(false);
  });

  it('does not block the event loop while verifying', async () => {
    const hash = await hashSecret('s3cret');
    const order: string[] = [];
    setImmediate(() => order.push('immediate'));

    await verifySecret('s3cret', hash).then(() => order.push('verified'));

    expect(order).toEqual(['immediate', 'verified']);
  });

  it('does not block the event loop while verifying an unknown client', async () => {
    const order: string[] = [];
    setImmediate(() => order.push('immediate'));

    await verifySecret('s3cret', null).then(() => order.push('verified'));

    expect(order).toEqual(['immediate', 'verified']);
  });

  it('does not block the event loop while hashing', async () => {
    const order: string[] = [];
    setImmediate(() => order.push('immediate'));

    await hashSecret('s3cret').then(() => order.push('hashed'));

    expect(order).toEqual(['immediate', 'hashed']);
  });
});
