import { createHash, generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exportJWK, importPKCS8, importSPKI, JWK, KeyLike } from 'jose';

/**
 * Loads the RS256 key pair used to sign access tokens and the SSO session
 * cookie, exposed via /.well-known/jwks.json. Keys come from
 * JWT_PRIVATE_KEY/JWT_PUBLIC_KEY env vars if set, otherwise are generated
 * once and persisted next to the SQLite database.
 */
@Injectable()
export class RsaKeyProvider implements OnModuleInit {
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private publicJwk!: JWK;
  private keyId!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const { privateKeyPem, publicKeyPem } = this.loadOrGenerateKeyPair();
    this.privateKey = await importPKCS8(privateKeyPem, 'RS256');
    this.publicKey = await importSPKI(publicKeyPem, 'RS256');
    this.keyId = createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
    this.publicJwk = { ...(await exportJWK(this.publicKey)), kid: this.keyId, alg: 'RS256', use: 'sig' };
  }

  getPrivateKey(): KeyLike {
    return this.privateKey;
  }

  getPublicKey(): KeyLike {
    return this.publicKey;
  }

  getKeyId(): string {
    return this.keyId;
  }

  getPublicJwk(): JWK {
    return this.publicJwk;
  }

  private loadOrGenerateKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
    const envPrivateKey = this.config.get<string>('JWT_PRIVATE_KEY');
    const envPublicKey = this.config.get<string>('JWT_PUBLIC_KEY');
    if (envPrivateKey && envPublicKey) {
      return { privateKeyPem: normalizePem(envPrivateKey), publicKeyPem: normalizePem(envPublicKey) };
    }

    const dataDir = dirname(this.config.get<string>('DATABASE_PATH', 'data/auth.sqlite'));
    const privateKeyPath = join(dataDir, 'jwt-private.pem');
    const publicKeyPath = join(dataDir, 'jwt-public.pem');

    if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
      return {
        privateKeyPem: readFileSync(privateKeyPath, 'utf8'),
        publicKeyPem: readFileSync(publicKeyPath, 'utf8'),
      };
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    mkdirSync(dataDir, { recursive: true });
    writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    writeFileSync(publicKeyPath, publicKey);

    return { privateKeyPem: privateKey, publicKeyPem: publicKey };
  }
}

function normalizePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}
