import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { decodeJwt, SignJWT } from 'jose';
import { ACCESS_TOKEN_TTL } from '../../domain/auth/token.service';
import { JwksTokenService } from './jwks-token.service';
import { JwtSessionService } from './jwt-session.service';
import { RsaKeyProvider } from './rsa-key-provider';

const ISSUER = 'https://auth.example.test';
const CONFIG = new ConfigService({ AUTH_BASE_URL: `${ISSUER}/` });

async function createKeyProvider(
  databasePath: string,
): Promise<RsaKeyProvider> {
  const config = new ConfigService({ DATABASE_PATH: databasePath });
  const keys = new RsaKeyProvider(config);
  await keys.onModuleInit();
  return keys;
}

describe('RsaKeyProvider', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auth-keys-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('generates and persists a key pair, then reuses it on next load', async () => {
    const databasePath = join(dir, 'auth.sqlite');
    const first = await createKeyProvider(databasePath);
    const second = await createKeyProvider(databasePath);

    expect(first.getKeyId()).toBe(second.getKeyId());
    expect(first.getPublicJwk()).toEqual(second.getPublicJwk());
  });

  it('exposes the public key as a JWK with kid, alg, and use', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const jwk = keys.getPublicJwk();

    expect(jwk.kid).toBe(keys.getKeyId());
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(jwk.kty).toBe('RSA');
  });
});

describe('JwksTokenService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auth-keys-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('signs and verifies an access token', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys, CONFIG);

    const token = await service.signAccessToken({
      sub: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: true,
      aud: 'budget',
    });
    const claims = await service.verifyAccessToken(token, 'budget');

    expect(claims?.sub).toBe('user-1');
    expect(claims?.email).toBe('alice@example.com');
    expect(claims?.name).toBe('Alice');
    expect(claims?.isAdmin).toBe(true);
    expect(claims?.aud).toBe('budget');
    expect(claims!.exp - claims!.iat).toBe(ACCESS_TOKEN_TTL);
  });

  it('rejects a token with the wrong audience', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys, CONFIG);

    const token = await service.signAccessToken({
      sub: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: false,
      aud: 'budget',
    });

    expect(await service.verifyAccessToken(token, 'other-client')).toBeNull();
  });

  describe('issuer (PC3)', () => {
    const payload = {
      sub: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: false,
      aud: 'budget',
    };

    async function signWith(keys: RsaKeyProvider, iss?: string) {
      const jwt = new SignJWT({
        email: payload.email,
        name: payload.name,
        isAdmin: payload.isAdmin,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keys.getKeyId() })
        .setSubject(payload.sub)
        .setAudience(payload.aud)
        .setIssuedAt()
        .setExpirationTime('60s');
      return (iss ? jwt.setIssuer(iss) : jwt).sign(keys.getPrivateKey());
    }

    it('emits iss, the origin of AUTH_BASE_URL', async () => {
      const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
      const service = new JwksTokenService(keys, CONFIG);

      const token = await service.signAccessToken(payload);

      expect(decodeJwt(token).iss).toBe(ISSUER);
      expect(await service.verifyAccessToken(token, 'budget')).not.toBeNull();
    });

    it('rejects a token from another issuer', async () => {
      const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
      const service = new JwksTokenService(keys, CONFIG);

      for (const iss of ['https://evil.example.test', `${ISSUER}/`]) {
        expect(
          await service.verifyAccessToken(await signWith(keys, iss)),
        ).toBeNull();
      }
    });

    it('rejects an SSO session token signed by the same key', async () => {
      const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
      const service = new JwksTokenService(keys, CONFIG);

      const session = await new JwtSessionService(keys).sign('user-1', 0);

      expect(await service.verifyAccessToken(session)).toBeNull();
    });

    it('rejects a token without iss (B3: required)', async () => {
      const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
      const service = new JwksTokenService(keys, CONFIG);

      expect(await service.verifyAccessToken(await signWith(keys))).toBeNull();
    });
  });

  describe('audience (PC4)', () => {
    async function signFor(keys: RsaKeyProvider, aud: string | string[]) {
      return new SignJWT({ email: 'a@example.com', name: 'A', isAdmin: false })
        .setProtectedHeader({ alg: 'RS256', kid: keys.getKeyId() })
        .setIssuer(ISSUER)
        .setSubject('user-1')
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime('60s')
        .sign(keys.getPrivateKey());
    }

    it('rejects an audience listing several clients', async () => {
      const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
      const service = new JwksTokenService(keys, CONFIG);

      expect(
        await service.verifyAccessToken(await signFor(keys, ['budget', 'ai'])),
      ).toBeNull();
      expect(
        await service.verifyAccessToken(await signFor(keys, [])),
      ).toBeNull();
    });

    it('reads a single-entry audience list as that client', async () => {
      const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
      const service = new JwksTokenService(keys, CONFIG);

      expect(
        (await service.verifyAccessToken(await signFor(keys, ['budget'])))?.aud,
      ).toBe('budget');
    });
  });

  it('rejects a malformed token', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys, CONFIG);

    expect(await service.verifyAccessToken('not-a-token')).toBeNull();
  });

  it('exposes the public key via JWKS', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys, CONFIG);

    const jwks = await service.getJwks();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBe(keys.getKeyId());
  });
});

describe('JwtSessionService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auth-keys-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('signs and verifies a session token with its session version', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwtSessionService(keys);

    const token = await service.sign('u1', 3);

    expect(await service.verify(token)).toEqual({
      userId: 'u1',
      sessionVersion: 3,
    });
  });

  // Cookies issued before the sv claim existed stay readable until the strict rollout (PC9 D3).
  it('reads a session token without sv as a legacy token (version null)', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwtSessionService(keys);

    expect(await service.verify(await signRaw(keys, {}))).toEqual({
      userId: 'u1',
      sessionVersion: null,
    });
  });

  it.each([
    ['a string', 'x'],
    ['a non-integer', 1.5],
    ['a negative number', -1],
  ])('rejects a session token whose sv is %s', async (_label, sv) => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwtSessionService(keys);

    expect(await service.verify(await signRaw(keys, { sv }))).toBeNull();
  });

  it('rejects a malformed session token', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwtSessionService(keys);

    expect(await service.verify('not-a-token')).toBeNull();
  });
});

// A session JWT signed like JwtSessionService does, with arbitrary extra claims.
async function signRaw(
  keys: RsaKeyProvider,
  claims: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: keys.getKeyId() })
    .setSubject('u1')
    .setAudience('auth-service-session')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(keys.getPrivateKey());
}
