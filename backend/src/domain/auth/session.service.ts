const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Port (driven side) implemented by the infrastructure layer. Issues and
 * verifies the SSO session cookie (separate from OAuth2 access tokens).
 */
export abstract class SessionService {
  abstract sign(userId: string, ttlSeconds?: number): Promise<string>;
  abstract verify(token: string): Promise<string | null>;
}

export const SESSION_TTL = SESSION_TTL_SECONDS;
