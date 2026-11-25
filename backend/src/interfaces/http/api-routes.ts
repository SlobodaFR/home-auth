// All /auth/* routes are POST-only, so the static SPA fallback (GET-only)
// never intercepts them. GET /auth/callback?token=... must fall through to
// index.html so the React app can handle the magic-link redirect.
// `{/*path}` = the prefix itself and everything under it (Express 4: `/x` + `/x/(.*)`).
/**
 * Excluded from the SPA fallback. Express 5 syntax (path-to-regexp 8): wildcards are named
 * (`*path`), a bare `(.*)` throws at boot.
 */
export const API_ROUTES = [
  '/.well-known{/*path}',
  '/docs{/*path}',
  '/authorize',
  '/token{/*path}',
  '/userinfo',
  '/profile{/*path}',
  '/avatars{/*path}',
  '/admin{/*path}',
  '/healthz',
];
