import { DEV_PSEUDONYM_SECRET, validateEnv } from './validate-env';

const STRONG = 'f'.repeat(64);

describe('validateEnv', () => {
  describe('in production', () => {
    it('accepts a secret of at least 32 bytes', () => {
      expect(
        validateEnv({ NODE_ENV: 'production', PSEUDONYM_SECRET: STRONG })
          .PSEUDONYM_SECRET,
      ).toBe(STRONG);
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['shorter than 32 bytes', 'x'.repeat(31)],
      ['the development fallback', DEV_PSEUDONYM_SECRET],
    ])('rejects a secret that is %s', (_label, secret) => {
      expect(() =>
        validateEnv({ NODE_ENV: 'production', PSEUDONYM_SECRET: secret }),
      ).toThrow('PSEUDONYM_SECRET');
    });
  });

  describe('outside production', () => {
    it('falls back to the development secret', () => {
      expect(validateEnv({ NODE_ENV: 'development' }).PSEUDONYM_SECRET).toBe(
        DEV_PSEUDONYM_SECRET,
      );
      expect(validateEnv({}).PSEUDONYM_SECRET).toBe(DEV_PSEUDONYM_SECRET);
    });

    it('keeps a provided secret and the other variables', () => {
      expect(validateEnv({ PSEUDONYM_SECRET: STRONG, PORT: '3000' })).toEqual({
        PSEUDONYM_SECRET: STRONG,
        PORT: '3000',
      });
    });
  });
});
