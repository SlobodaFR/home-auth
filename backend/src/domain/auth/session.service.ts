const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface VerifiedSession {
  userId: string;
  sessionVersion: number | null;
}

/**
 * Port (driven side) implemented by the infrastructure layer. Issues and
 * verifies the SSO session cookie (separate from OAuth2 access tokens).
 */
export abstract class SessionService {
  abstract sign(
    userId: string,
    sessionVersion: number,
    ttlSeconds?: number,
  ): Promise<string>;
  /**
   * sessionVersion is null for a legacy token issued before the sv claim existed (transitional,
   * removed by PC9 D3).
   */
  abstract verify(token: string): Promise<VerifiedSession | null>;
}

export const SESSION_TTL = SESSION_TTL_SECONDS;
