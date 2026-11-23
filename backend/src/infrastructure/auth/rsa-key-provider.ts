import { createHash } from 'crypto';
import { dirname } from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exportJWK, importPKCS8, importSPKI, JWK, KeyLike } from 'jose';
import { resolveJwtKeyMaterial } from './jwt-key-material';

/**
 * Loads the RS256 key pair used to sign access tokens and the SSO session
 * cookie, exposed via /.well-known/jwks.json. Keys come from the env
 * (JWT_PRIVATE_KEY_B64/JWT_PUBLIC_KEY_B64, or raw JWT_PRIVATE_KEY/
 * JWT_PUBLIC_KEY) if set, otherwise from the PEM files next to the SQLite
 * database, generated once if absent. When both exist they must be the same
 * pair or startup is refused (see jwt-key-material.ts).
 */
@Injectable()
export class RsaKeyProvider implements OnModuleInit {
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private publicJwk!: JWK;
  private keyId!: string;

  private readonly logger = new Logger(RsaKeyProvider.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const { privateKeyPem, publicKeyPem, source, fingerprint } =
      resolveJwtKeyMaterial({
        env: {
          JWT_PRIVATE_KEY: this.config.get<string>('JWT_PRIVATE_KEY'),
          JWT_PUBLIC_KEY: this.config.get<string>('JWT_PUBLIC_KEY'),
          JWT_PRIVATE_KEY_B64: this.config.get<string>('JWT_PRIVATE_KEY_B64'),
          JWT_PUBLIC_KEY_B64: this.config.get<string>('JWT_PUBLIC_KEY_B64'),
        },
        dataDir: dirname(
          this.config.get<string>('DATABASE_PATH', 'data/auth.sqlite'),
        ),
      });
    this.privateKey = await importPKCS8(privateKeyPem, 'RS256');
    this.publicKey = await importSPKI(publicKeyPem, 'RS256');
    this.keyId = createHash('sha256')
      .update(publicKeyPem)
      .digest('hex')
      .slice(0, 16);
    this.publicJwk = {
      ...(await exportJWK(this.publicKey)),
      kid: this.keyId,
      alg: 'RS256',
      use: 'sig',
    };
    this.logger.log(
      `JWT signing key ready: source=${source} kid=${this.keyId} fingerprint=sha256:${fingerprint}`,
    );
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
}
