import { createHash, generateKeyPairSync } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MockInstance } from 'vitest';
import { RsaKeyProvider } from './rsa-key-provider';

function rsaPair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const b64 = (pem: string): string =>
  Buffer.from(pem, 'utf8').toString('base64');

describe('RsaKeyProvider startup', () => {
  let dir: string;
  let logSpy: MockInstance<Logger['log']>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auth-keys-startup-'));
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  function provider(env: Record<string, string>): RsaKeyProvider {
    return new RsaKeyProvider(
      new ConfigService({ DATABASE_PATH: join(dir, 'sso.sqlite'), ...env }),
    );
  }

  it('keeps the historical key id (sha256 of the volume public PEM) when env keys match the volume', async () => {
    const pair = rsaPair();
    writeFileSync(join(dir, 'jwt-private.pem'), pair.privateKey);
    writeFileSync(join(dir, 'jwt-public.pem'), pair.publicKey);
    const legacyKid = createHash('sha256')
      .update(pair.publicKey)
      .digest('hex')
      .slice(0, 16);

    const filesOnly = provider({});
    await filesOnly.onModuleInit();
    const withEnv = provider({
      JWT_PRIVATE_KEY_B64: b64(pair.privateKey),
      JWT_PUBLIC_KEY_B64: b64(pair.publicKey),
    });
    await withEnv.onModuleInit();

    expect(filesOnly.getKeyId()).toBe(legacyKid);
    expect(withEnv.getKeyId()).toBe(legacyKid);
  });

  it('logs the key id, fingerprint and source, never the key material', async () => {
    const pair = rsaPair();
    const keys = provider({
      JWT_PRIVATE_KEY_B64: b64(pair.privateKey),
      JWT_PUBLIC_KEY_B64: b64(pair.publicKey),
    });
    await keys.onModuleInit();

    const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain(`kid=${keys.getKeyId()}`);
    expect(logged).toMatch(/fingerprint=sha256:[0-9a-f]{64}/);
    expect(logged).toContain('source=env');
    expect(logged).not.toContain('BEGIN');
    expect(logged).not.toContain(b64(pair.privateKey).slice(0, 40));
  });

  it('rejects startup when env keys do not match the volume', async () => {
    const volume = rsaPair();
    const other = rsaPair();
    writeFileSync(join(dir, 'jwt-private.pem'), volume.privateKey);
    writeFileSync(join(dir, 'jwt-public.pem'), volume.publicKey);

    await expect(
      provider({
        JWT_PRIVATE_KEY_B64: b64(other.privateKey),
        JWT_PUBLIC_KEY_B64: b64(other.publicKey),
      }).onModuleInit(),
    ).rejects.toThrow(/refusing to start/i);
  });
});
