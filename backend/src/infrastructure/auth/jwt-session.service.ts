import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import {
  SessionService,
  SESSION_TTL,
  VerifiedSession,
} from '../../domain/auth/session.service';
import { RsaKeyProvider } from './rsa-key-provider';

const SESSION_AUDIENCE = 'auth-service-session';

@Injectable()
export class JwtSessionService extends SessionService {
  constructor(private readonly keys: RsaKeyProvider) {
    super();
  }

  async sign(
    userId: string,
    sessionVersion: number,
    ttlSeconds: number = SESSION_TTL,
  ): Promise<string> {
    return new SignJWT({ sv: sessionVersion })
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.getKeyId() })
      .setSubject(userId)
      .setAudience(SESSION_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.keys.getPrivateKey());
  }

  async verify(token: string): Promise<VerifiedSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys.getPublicKey(), {
        audience: SESSION_AUDIENCE,
      });
      if (!payload.sub) {
        return null;
      }
      // Transitional (PC9 D2): a token without sv predates the claim and counts as the current
      // version. A present but malformed sv is never valid.
      if (payload.sv === undefined) {
        return { userId: payload.sub, sessionVersion: null };
      }
      if (
        typeof payload.sv !== 'number' ||
        !Number.isInteger(payload.sv) ||
        payload.sv < 0
      ) {
        return null;
      }
      return { userId: payload.sub, sessionVersion: payload.sv };
    } catch {
      return null;
    }
  }
}
