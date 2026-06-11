import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { SessionService, SESSION_TTL } from '../../domain/auth/session.service';
import { RsaKeyProvider } from './rsa-key-provider';

const SESSION_AUDIENCE = 'auth-service-session';

@Injectable()
export class JwtSessionService extends SessionService {
  constructor(private readonly keys: RsaKeyProvider) {
    super();
  }

  async sign(userId: string, ttlSeconds: number = SESSION_TTL): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.getKeyId() })
      .setSubject(userId)
      .setAudience(SESSION_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.keys.getPrivateKey());
  }

  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys.getPublicKey(), { audience: SESSION_AUDIENCE });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
