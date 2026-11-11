import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Controller, Get } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { applySecurityHeaders } from './security-headers';

@Controller()
class StubController {
  @Get('ping')
  ping(): string {
    return 'pong';
  }

  @Get('avatars/:userId')
  avatar(): string {
    return 'image';
  }

  @Get('docs')
  docs(): string {
    return 'swagger';
  }
}

describe('security headers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'spa-'));
    writeFileSync(join(publicDir, 'index.html'), '<html></html>');
    const moduleRef = await Test.createTestingModule({
      controllers: [StubController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    applySecurityHeaders(app);
    // Static files go through the same middleware chain as the SPA served in production.
    app.useStaticAssets(publicDir);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectStrictHeaders = (headers: Record<string, string>) => {
    const csp = headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data: https://ui-avatars.com");
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
  };

  it('protects API responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/ping')
      .expect(200);

    expectStrictHeaders(response.headers);
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'same-origin',
    );
  });

  // The magic-link page carries the token in its URL: no Referer may leak it.
  it('protects the SPA pages served as static files', async () => {
    const response = await request(app.getHttpServer())
      .get('/index.html')
      .expect(200);

    expectStrictHeaders(response.headers);
  });

  // Client apps display avatars with <img src="https://auth.../avatars/:id">.
  it('lets other origins embed avatars', async () => {
    const response = await request(app.getHttpServer())
      .get('/avatars/u1')
      .expect(200);

    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    // Express routes case-insensitively: so must the header choice.
    const upper = await request(app.getHttpServer())
      .get('/Avatars/u1')
      .expect(200);
    expect(upper.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  // Swagger UI relies on inline scripts.
  it('does not apply the strict CSP to /docs', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs')
      .expect(200);

    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['x-frame-options']).toBe('DENY');
  });
});
