import { DEV_PSEUDONYM_SECRET, validateEnv } from './validate-env';

const STRONG = 'f'.repeat(64);
const PROD = {
  NODE_ENV: 'production',
  PSEUDONYM_SECRET: STRONG,
  AUTH_BASE_URL: 'https://auth.sloboda.fr',
  FRONTEND_URL: 'https://auth.sloboda.fr',
};

describe('validateEnv', () => {
  describe('in production', () => {
    it('accepts a secret of at least 32 bytes', () => {
      expect(validateEnv(PROD).PSEUDONYM_SECRET).toBe(STRONG);
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['shorter than 32 bytes', 'x'.repeat(31)],
      ['the development fallback', DEV_PSEUDONYM_SECRET],
    ])('rejects a secret that is %s', (_label, secret) => {
      expect(() => validateEnv({ ...PROD, PSEUDONYM_SECRET: secret })).toThrow(
        'PSEUDONYM_SECRET',
      );
    });
  });

  describe('public URLs in production', () => {
    it.each([
      ['AUTH_BASE_URL missing', { AUTH_BASE_URL: undefined }, 'AUTH_BASE_URL'],
      ['FRONTEND_URL missing', { FRONTEND_URL: undefined }, 'FRONTEND_URL'],
      [
        'FRONTEND_URL over http',
        { FRONTEND_URL: 'http://auth.sloboda.fr' },
        'FRONTEND_URL',
      ],
      [
        'AUTH_BASE_URL not a URL',
        { AUTH_BASE_URL: 'auth.sloboda.fr' },
        'AUTH_BASE_URL',
      ],
    ])('rejects %s', (_label, override, variable) => {
      expect(() => validateEnv({ ...PROD, ...override })).toThrow(variable);
    });

    it('accepts https URLs', () => {
      expect(() => validateEnv(PROD)).not.toThrow();
    });

    it('does not require them outside production', () => {
      expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
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
