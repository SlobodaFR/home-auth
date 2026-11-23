import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import {
  AccessTokenClaims,
  AccessTokenPayload,
  ACCESS_TOKEN_TTL,
  JsonWebKeySet,
  TokenService,
} from '../../domain/auth/token.service';
import { RsaKeyProvider } from './rsa-key-provider';

@Injectable()
export class JwksTokenService extends TokenService {
  /** iss of every access token (PC3): the origin of AUTH_BASE_URL (validate-env forbids a path). */
  private readonly issuer: string;

  constructor(
    private readonly keys: RsaKeyProvider,
    config: ConfigService,
  ) {
    super();
    this.issuer = new URL(
      config.get<string>('AUTH_BASE_URL') || 'http://localhost:3000',
    ).origin;
  }

  async signAccessToken(
    payload: AccessTokenPayload,
    ttlSeconds: number = ACCESS_TOKEN_TTL,
  ): Promise<string> {
    return new SignJWT({
      email: payload.email,
      name: payload.name,
      isAdmin: payload.isAdmin,
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.getKeyId() })
      .setIssuer(this.issuer)
      .setSubject(payload.sub)
      .setAudience(payload.aud)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.keys.getPrivateKey());
  }

  async verifyAccessToken(
    token: string,
    audience?: string,
  ): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys.getPublicKey(), {
        algorithms: ['RS256'],
        ...(audience ? { audience } : {}),
      });
      // Absent iss is tolerated while tokens issued before B1 are still valid (≤ 15 min); B3 requires it.
      if (payload.iss !== undefined && payload.iss !== this.issuer) {
        return null;
      }
      // Exactly one audience (PC4): a token naming several clients is never accepted. The guard
      // passes no `audience` (any existing client is valid), so this is the only aud check there.
      const aud = Array.isArray(payload.aud)
        ? payload.aud.length === 1
          ? payload.aud[0]
          : undefined
        : payload.aud;
      if (
        !payload.sub ||
        typeof payload.email !== 'string' ||
        typeof payload.name !== 'string' ||
        typeof payload.isAdmin !== 'boolean' ||
        !aud ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        return null;
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        isAdmin: payload.isAdmin,
        aud,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch {
      return null;
    }
  }

  getJwks(): Promise<JsonWebKeySet> {
    return Promise.resolve({
      keys: [this.keys.getPublicJwk() as unknown as Record<string, unknown>],
    });
  }
}
