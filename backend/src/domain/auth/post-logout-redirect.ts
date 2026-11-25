export const POST_LOGOUT_URI_MAX_LENGTH = 2048;

function originOf(value: string): string | null {
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/**
 * PC10: validates a post_logout_redirect_uri against the origins of the client's registered
 * redirect URIs and returns the final Location (built from the parsed URL, `state` encoded and
 * overriding any `state` already present), or null when it must not be followed.
 *
 * Any path and query of a registered origin is trusted. Custom-scheme URIs (null origin) never
 * match; userinfo and fragments are refused.
 */
export function resolvePostLogoutRedirect(
  candidate: string,
  registeredUris: readonly string[],
  state?: string,
): string | null {
  if (candidate.length === 0 || candidate.length > POST_LOGOUT_URI_MAX_LENGTH) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.username !== '' || url.password !== '' || candidate.includes('#')) {
    return null;
  }
  const origin = originOf(url.href);
  if (!origin || !registeredUris.some((uri) => originOf(uri) === origin)) {
    return null;
  }
  if (state !== undefined) {
    url.searchParams.set('state', state);
  }
  return url.href;
}
