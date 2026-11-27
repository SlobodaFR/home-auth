import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { API_ROUTES } from './api-routes';

// The exclusion list is exercised through the real ServeStaticModule (path-to-regexp 8, Express 5
// syntax). No controller is registered: an excluded route must fall through to Nest's JSON 404,
// anything else must be answered with the SPA's index.html.
describe('API_ROUTES (excluded from the SPA fallback)', () => {
  let root: string;
  let app: NestExpressApplication;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'spa-'));
    writeFileSync(join(root, 'index.html'), '<html>SPA</html>');

    @Module({
      imports: [
        ServeStaticModule.forRoot({ rootPath: root, exclude: API_ROUTES }),
      ],
    })
    class TestModule {}

    app = await NestFactory.create<NestExpressApplication>(TestModule, {
      logger: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    '/.well-known/jwks.json',
    '/.well-known/openid-configuration',
    '/authorize?client_id=a&state=b',
    '/logout?client_id=x',
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
    '/version',
  ])('keeps %s on the API', async (url) => {
    const response = await request(app.getHttpServer()).get(url);
    expect(response.status).toBe(404);
    expect(response.text).not.toContain('SPA');
  });

  it.each([
    '/',
    '/login',
    '/auth/callback?token=abc',
    '/consent/x',
    '/logout/confirm?client_id=x',
    // Trailing slash: not the API route, so it reaches the SPA (intentional).
    '/logout/',
  ])('leaves %s to the SPA', async (url) => {
    const response = await request(app.getHttpServer()).get(url);
    expect(response.status).toBe(200);
    expect(response.text).toContain('SPA');
  });
});
