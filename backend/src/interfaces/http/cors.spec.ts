import { Controller, Get } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { buildCorsOptions } from './cors';

describe('buildCorsOptions', () => {
  it('disables CORS without a frontend URL', () => {
    expect(buildCorsOptions({ authBaseUrl: 'http://localhost:3000' })).toEqual({
      origin: false,
    });
  });

  it('disables CORS when the frontend is served from the same origin', () => {
    expect(
      buildCorsOptions({
        authBaseUrl: 'https://auth.sloboda.fr',
        frontendUrl: 'https://auth.sloboda.fr/',
      }),
    ).toEqual({ origin: false });
  });

  it('allows exactly the frontend origin, normalized, when it differs', () => {
    expect(
      buildCorsOptions({
        authBaseUrl: 'http://localhost:3000',
        frontendUrl: 'http://localhost:5173/app',
      }),
    ).toEqual({ origin: ['http://localhost:5173'], credentials: true });
  });

  it('rejects an invalid frontend URL', () => {
    expect(() =>
      buildCorsOptions({
        authBaseUrl: 'http://localhost:3000',
        frontendUrl: 'pas-une-url',
      }),
    ).toThrow('FRONTEND_URL must be a valid URL');
  });
});

@Controller('profile')
class ProfileStubController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

describe('CORS (HTTP)', () => {
  async function createApp(
    frontendUrl?: string,
  ): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileStubController],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.enableCors(
      buildCorsOptions({ authBaseUrl: 'http://localhost:3000', frontendUrl }),
    );
    await app.init();
    return app;
  }

  it('sends no CORS headers to another origin, including on preflight', async () => {
    const app = await createApp();

    const get = await request(app.getHttpServer())
      .get('/profile')
      .set('Origin', 'https://evil.example');
    const preflight = await request(app.getHttpServer())
      .options('/profile')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    for (const response of [get, preflight]) {
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(
        response.headers['access-control-allow-credentials'],
      ).toBeUndefined();
    }
    await app.close();
  });

  it('allows only the configured frontend origin', async () => {
    const app = await createApp('http://localhost:5173');

    const allowed = await request(app.getHttpServer())
      .get('/profile')
      .set('Origin', 'http://localhost:5173');
    const other = await request(app.getHttpServer())
      .get('/profile')
      .set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
