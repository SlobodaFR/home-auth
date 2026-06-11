import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_TTL } from '../../domain/auth/token.service';
import { JwksTokenService } from './jwks-token.service';
import { JwtSessionService } from './jwt-session.service';
import { RsaKeyProvider } from './rsa-key-provider';

async function createKeyProvider(databasePath: string): Promise<RsaKeyProvider> {
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
    const service = new JwksTokenService(keys);

    const token = await service.signAccessToken({ sub: 'user-1', email: 'alice@example.com', name: 'Alice', aud: 'budget' });
    const claims = await service.verifyAccessToken(token, 'budget');

    expect(claims?.sub).toBe('user-1');
    expect(claims?.email).toBe('alice@example.com');
    expect(claims?.name).toBe('Alice');
    expect(claims?.aud).toBe('budget');
    expect(claims!.exp - claims!.iat).toBe(ACCESS_TOKEN_TTL);
  });

  it('rejects a token with the wrong audience', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys);

    const token = await service.signAccessToken({ sub: 'user-1', email: 'alice@example.com', name: 'Alice', aud: 'budget' });

    expect(await service.verifyAccessToken(token, 'other-client')).toBeNull();
  });

  it('rejects a malformed token', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys);

    expect(await service.verifyAccessToken('not-a-token')).toBeNull();
  });

  it('exposes the public key via JWKS', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwksTokenService(keys);

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

  it('signs and verifies a session token', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwtSessionService(keys);

    const token = await service.sign('user-1');

    expect(await service.verify(token)).toBe('user-1');
  });

  it('rejects a malformed session token', async () => {
    const keys = await createKeyProvider(join(dir, 'auth.sqlite'));
    const service = new JwtSessionService(keys);

    expect(await service.verify('not-a-token')).toBeNull();
  });
});
