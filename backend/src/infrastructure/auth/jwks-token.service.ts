import { Injectable } from '@nestjs/common';
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
  constructor(private readonly keys: RsaKeyProvider) {
    super();
  }

  async signAccessToken(payload: AccessTokenPayload, ttlSeconds: number = ACCESS_TOKEN_TTL): Promise<string> {
    return new SignJWT({ email: payload.email, name: payload.name })
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.getKeyId() })
      .setSubject(payload.sub)
      .setAudience(payload.aud)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.keys.getPrivateKey());
  }

  async verifyAccessToken(token: string, audience?: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys.getPublicKey(), audience ? { audience } : undefined);
      if (
        !payload.sub ||
        typeof payload.email !== 'string' ||
        typeof payload.name !== 'string' ||
        !payload.aud ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        return null;
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        aud: Array.isArray(payload.aud) ? payload.aud[0] : payload.aud,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch {
      return null;
    }
  }

  getJwks(): Promise<JsonWebKeySet> {
    return Promise.resolve({ keys: [this.keys.getPublicJwk() as unknown as Record<string, unknown>] });
  }
}
