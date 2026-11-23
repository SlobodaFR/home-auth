import { createHash, createPublicKey, generateKeyPairSync } from 'crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  publicKeyFingerprint,
  resolveJwtKeyMaterial,
  type JwtKeyEnv,
} from './jwt-key-material';

interface Pair {
  privateKey: string;
  publicKey: string;
}

function rsaPair(): Pair {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const b64 = (pem: string): string =>
  Buffer.from(pem, 'utf8').toString('base64');

function fingerprintOf(pair: Pair): string {
  return publicKeyFingerprint(createPublicKey(pair.publicKey));
}

describe('resolveJwtKeyMaterial', () => {
  let pairA: Pair;
  let pairB: Pair;
  let dir: string;

  beforeAll(() => {
    pairA = rsaPair();
    pairB = rsaPair();
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auth-jwt-material-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeFiles(pair: Pair): void {
    writeFileSync(join(dir, 'jwt-private.pem'), pair.privateKey);
    writeFileSync(join(dir, 'jwt-public.pem'), pair.publicKey);
  }

  function snapshotDir(): Record<string, string> {
    return Object.fromEntries(
      readdirSync(dir).map((name) => [
        name,
        readFileSync(join(dir, name), 'utf8'),
      ]),
    );
  }

  const resolve = (env: JwtKeyEnv) =>
    resolveJwtKeyMaterial({ env, dataDir: dir });

  const envB64 = (pair: Pair): JwtKeyEnv => ({
    JWT_PRIVATE_KEY_B64: b64(pair.privateKey),
    JWT_PUBLIC_KEY_B64: b64(pair.publicKey),
  });

  describe('fingerprint', () => {
    it('is the SHA-256 of the SPKI DER of the public key', () => {
      const der = createPublicKey(pairA.publicKey).export({
        type: 'spki',
        format: 'der',
      });
      expect(fingerprintOf(pairA)).toBe(
        createHash('sha256').update(der).digest('hex'),
      );
    });
  });

  describe('env and volume files both present', () => {
    it('starts on the volume key pair when the fingerprints match', () => {
      writeFiles(pairA);
      const material = resolve(envB64(pairA));

      expect(material.source).toBe('env+files');
      expect(material.fingerprint).toBe(fingerprintOf(pairA));
      expect(material.privateKeyPem).toBe(pairA.privateKey);
      expect(material.publicKeyPem).toBe(pairA.publicKey);
    });

    it('matches even when the env PEM differs only by whitespace', () => {
      writeFiles(pairA);
      const material = resolve({
        JWT_PRIVATE_KEY_B64: b64(pairA.privateKey.trimEnd()),
        JWT_PUBLIC_KEY_B64: b64(`${pairA.publicKey.trimEnd()}\n\n`),
      });

      expect(material.source).toBe('env+files');
      expect(material.publicKeyPem).toBe(pairA.publicKey);
    });

    it('refuses to start when the env key differs from the volume key, naming only fingerprints', () => {
      writeFiles(pairA);
      let message = '';
      try {
        resolve(envB64(pairB));
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain(fingerprintOf(pairA));
      expect(message).toContain(fingerprintOf(pairB));
      expect(message).not.toContain('BEGIN');
      expect(message).not.toContain(pairA.privateKey.split('\n')[1]);
      expect(message).not.toContain(pairB.privateKey.split('\n')[1]);
      expect(message).not.toContain(b64(pairB.privateKey).slice(0, 40));
    });

    it('refuses when only the private env key differs from the volume pair', () => {
      writeFiles(pairA);
      expect(() =>
        resolve({
          JWT_PRIVATE_KEY_B64: b64(pairB.privateKey),
          JWT_PUBLIC_KEY_B64: b64(pairA.publicKey),
        }),
      ).toThrow(/do not form a pair/);
    });

    it('never modifies or deletes the volume files', () => {
      writeFiles(pairA);
      const before = snapshotDir();
      resolve(envB64(pairA));
      expect(snapshotDir()).toEqual(before);

      expect(() => resolve(envB64(pairB))).toThrow(/mismatch/);
      expect(snapshotDir()).toEqual(before);
    });

    it('refuses when the volume files are not a valid pair', () => {
      writeFileSync(join(dir, 'jwt-private.pem'), pairA.privateKey);
      writeFileSync(join(dir, 'jwt-public.pem'), pairB.publicKey);
      expect(() => resolve(envB64(pairA))).toThrow(/volume/);
    });

    it('refuses when the volume holds only one of the two files', () => {
      writeFileSync(join(dir, 'jwt-private.pem'), pairA.privateKey);
      expect(() => resolve(envB64(pairA))).toThrow(/only one/);
      expect(existsSync(join(dir, 'jwt-public.pem'))).toBe(false);
    });
  });

  describe('env only (no files in the volume)', () => {
    it('uses the env key pair without writing anything to the volume', () => {
      const material = resolve(envB64(pairA));

      expect(material.source).toBe('env');
      expect(material.fingerprint).toBe(fingerprintOf(pairA));
      expect(material.publicKeyPem).toBe(pairA.publicKey);
      expect(readdirSync(dir)).toEqual([]);
    });

    it('does not create a missing data directory', () => {
      const missing = join(dir, 'nope');
      resolveJwtKeyMaterial({ env: envB64(pairA), dataDir: missing });
      expect(existsSync(missing)).toBe(false);
    });

    it('accepts raw PEM and escaped-newline PEM (legacy variables)', () => {
      const raw = resolve({
        JWT_PRIVATE_KEY: pairA.privateKey,
        JWT_PUBLIC_KEY: pairA.publicKey,
      });
      const escaped = resolve({
        JWT_PRIVATE_KEY: pairA.privateKey.replace(/\n/g, '\\n'),
        JWT_PUBLIC_KEY: pairA.publicKey.replace(/\n/g, '\\n'),
      });

      expect(raw.fingerprint).toBe(fingerprintOf(pairA));
      expect(escaped.fingerprint).toBe(fingerprintOf(pairA));
    });

    it('accepts base64 wrapped over several lines', () => {
      const wrap = (value: string): string => value.replace(/(.{64})/g, '$1\n');
      const material = resolve({
        JWT_PRIVATE_KEY_B64: wrap(b64(pairA.privateKey)),
        JWT_PUBLIC_KEY_B64: wrap(b64(pairA.publicKey)),
      });
      expect(material.fingerprint).toBe(fingerprintOf(pairA));
    });

    it('derives the same key id input as the file the app would have generated', () => {
      // The kid is sha256(public PEM text): an env key must give the text
      // the volume file holds, or the JWKS kid would change on adoption.
      const material = resolve({
        JWT_PRIVATE_KEY_B64: b64(pairA.privateKey),
        JWT_PUBLIC_KEY_B64: b64(`${pairA.publicKey.trimEnd()}\n\n`),
      });
      expect(material.publicKeyPem).toBe(pairA.publicKey);
    });
  });

  describe('files only (no env keys)', () => {
    it('keeps loading the volume key pair', () => {
      writeFiles(pairA);
      const material = resolve({});

      expect(material.source).toBe('files');
      expect(material.fingerprint).toBe(fingerprintOf(pairA));
      expect(material.publicKeyPem).toBe(pairA.publicKey);
    });

    it('treats empty env values as absent', () => {
      writeFiles(pairA);
      const material = resolve({
        JWT_PRIVATE_KEY: '',
        JWT_PUBLIC_KEY: '  ',
        JWT_PRIVATE_KEY_B64: '',
        JWT_PUBLIC_KEY_B64: '',
      });
      expect(material.source).toBe('files');
    });

    it('refuses volume files that are not a key pair', () => {
      writeFileSync(join(dir, 'jwt-private.pem'), pairA.privateKey);
      writeFileSync(join(dir, 'jwt-public.pem'), pairB.publicKey);
      const before = snapshotDir();

      expect(() => resolve({})).toThrow(/do not form a pair/);
      expect(snapshotDir()).toEqual(before);
    });

    it('refuses an invalid PEM in the volume', () => {
      writeFileSync(join(dir, 'jwt-private.pem'), 'not a pem');
      writeFileSync(join(dir, 'jwt-public.pem'), pairA.publicKey);
      expect(() => resolve({})).toThrow(/volume.*private key/i);
    });
  });

  describe('nothing configured', () => {
    it('generates a pair once and persists it with a private mode', () => {
      const data = join(dir, 'data');
      mkdirSync(data);
      const first = resolveJwtKeyMaterial({ env: {}, dataDir: data });
      const second = resolveJwtKeyMaterial({ env: {}, dataDir: data });

      expect(first.source).toBe('generated');
      expect(second.source).toBe('files');
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(statSync(join(data, 'jwt-private.pem')).mode & 0o777).toBe(0o600);
      chmodSync(data, 0o700);
    });
  });

  describe('invalid configuration', () => {
    it.each([
      [
        'private only',
        (p: Pair) => ({ JWT_PRIVATE_KEY_B64: b64(p.privateKey) }),
      ],
      ['public only', (p: Pair) => ({ JWT_PUBLIC_KEY_B64: b64(p.publicKey) })],
    ])('refuses a half-configured pair (%s)', (_label, make) => {
      writeFiles(pairA);
      expect(() => resolve(make(pairA))).toThrow(/must be set together/);
    });

    it('refuses the same key given in both the base64 and raw variables', () => {
      expect(() =>
        resolve({
          ...envB64(pairA),
          JWT_PRIVATE_KEY: pairA.privateKey,
        }),
      ).toThrow(/JWT_PRIVATE_KEY.*JWT_PRIVATE_KEY_B64/);
    });

    it('refuses base64 that is not base64, without echoing the value', () => {
      const bad = 'this is *not* base64 !!';
      let message = '';
      try {
        resolve({
          JWT_PRIVATE_KEY_B64: bad,
          JWT_PUBLIC_KEY_B64: b64(pairA.publicKey),
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('JWT_PRIVATE_KEY_B64');
      expect(message).toMatch(/base64/);
      expect(message).not.toContain(bad);
    });

    it('refuses base64 that does not decode to a PEM', () => {
      expect(() =>
        resolve({
          JWT_PRIVATE_KEY_B64: b64('hello world'),
          JWT_PUBLIC_KEY_B64: b64(pairA.publicKey),
        }),
      ).toThrow(/JWT_PRIVATE_KEY_B64.*PEM/);
    });

    it('refuses a PEM that is not a private key', () => {
      expect(() =>
        resolve({
          JWT_PRIVATE_KEY_B64: b64(
            '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
          ),
          JWT_PUBLIC_KEY_B64: b64(pairA.publicKey),
        }),
      ).toThrow(/private key/);
    });

    it('refuses a PEM that is not a public key', () => {
      expect(() =>
        resolve({
          JWT_PRIVATE_KEY_B64: b64(pairA.privateKey),
          JWT_PUBLIC_KEY_B64: b64(
            '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n',
          ),
        }),
      ).toThrow(/public key/);
    });

    it('refuses a private and a public key that are not a pair (env only)', () => {
      let message = '';
      try {
        resolve({
          JWT_PRIVATE_KEY_B64: b64(pairA.privateKey),
          JWT_PUBLIC_KEY_B64: b64(pairB.publicKey),
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/do not form a pair/);
      expect(message).toContain(fingerprintOf(pairA));
      expect(message).toContain(fingerprintOf(pairB));
    });

    it('refuses a non-RSA key pair', () => {
      const ec = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      expect(() =>
        resolve({
          JWT_PRIVATE_KEY_B64: b64(ec.privateKey),
          JWT_PUBLIC_KEY_B64: b64(ec.publicKey),
        }),
      ).toThrow(/RSA/);
    });
  });
});
