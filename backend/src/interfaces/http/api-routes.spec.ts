import type { Request } from 'express';
import { isRouteExcluded } from '@nestjs/serve-static/dist/utils/is-route-excluded.util';
import { API_ROUTES } from './api-routes';

// @nestjs/serve-static is a no-op under @nestjs/testing, so the exclusion list is checked with the
// exact predicate it applies in production (path-to-regexp 8, Express 5 syntax).
const excluded = (url: string): boolean =>
  isRouteExcluded({ originalUrl: url } as Request, API_ROUTES);

describe('API_ROUTES (excluded from the SPA fallback)', () => {
  it.each([
    '/.well-known/jwks.json',
    '/.well-known/openid-configuration',
    '/authorize?client_id=a&state=b',
    '/token',
    '/token/',
    '/userinfo',
    '/profile',
    '/profile/avatar',
    '/avatars/u1',
    '/admin',
    '/admin/users',
    '/admin/clients/c1/access',
    '/docs',
    '/docs/swagger-ui.css',
    '/healthz',
  ])('keeps %s on the API', (url) => {
    expect(excluded(url)).toBe(true);
  });

  it.each(['/', '/login', '/auth/callback?token=abc', '/consent/x'])(
    'leaves %s to the SPA',
    (url) => {
      expect(excluded(url)).toBe(false);
    },
  );
});
