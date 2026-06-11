export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  aud: string;
}

export interface AccessTokenClaims extends AccessTokenPayload {
  iat: number;
  exp: number;
}

export interface JsonWebKeySet {
  keys: Record<string, unknown>[];
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Port (driven side) implemented by the infrastructure layer (RS256/JWKS).
 */
export abstract class TokenService {
  abstract signAccessToken(payload: AccessTokenPayload, ttlSeconds?: number): Promise<string>;
  abstract verifyAccessToken(token: string, audience?: string): Promise<AccessTokenClaims | null>;
  abstract getJwks(): Promise<JsonWebKeySet>;
}

export const ACCESS_TOKEN_TTL = ACCESS_TOKEN_TTL_SECONDS;
