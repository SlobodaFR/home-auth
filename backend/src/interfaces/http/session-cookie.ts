import type { CookieOptions } from 'express';

/** Security scheme name shared by @ApiCookieAuth and the Swagger document. */
export const SESSION_SECURITY_SCHEME = 'session-cookie';

/**
 * Name of the SSO session cookie. Production uses the `__Host-` prefix: the browser then only
 * accepts it with Secure, Path=/ and no Domain, so a sibling *.sloboda.fr subdomain cannot
 * overwrite it ("cookie tossing"). Development runs over plain http, where Secure cookies are
 * refused, hence the plain name.
 *
 * NODE_ENV is read when called, never at import: ConfigModule loads .env into process.env after
 * this module is imported.
 */
export function sessionCookieName(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  return nodeEnv === 'production' ? '__Host-auth_session' : 'auth_session';
}

/** Used both to set and to clear the cookie: a __Host- cookie is only cleared with these. */
export function sessionCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnv === 'production',
    path: '/',
  };
}
