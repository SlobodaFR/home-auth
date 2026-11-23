import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LogoutUseCase } from '../../application/auth/logout.use-case';
import { RequestMagicLinkUseCase } from '../../application/auth/request-magic-link.use-case';
import { VerifyMagicLinkUseCase } from '../../application/auth/verify-magic-link.use-case';
import { AuthController } from './controllers/auth.controller';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { sessionCookieName, sessionCookieOptions } from './session-cookie';

describe('sessionCookieName', () => {
  it('uses the __Host- prefix in production', () => {
    expect(sessionCookieName('production')).toBe('__Host-auth_session');
  });

  // The prefix requires Secure, and development runs over plain http.
  it('is auth_session outside production', () => {
    expect(sessionCookieName('development')).toBe('auth_session');
    expect(sessionCookieName(undefined)).toBe('auth_session');
  });

  it('reads NODE_ENV when called, not when imported', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieName()).toBe('__Host-auth_session');
    vi.unstubAllEnvs();
  });
});

describe('sessionCookieOptions', () => {
  // __Host-: Secure, Path=/, and no Domain, so a sibling subdomain cannot overwrite the cookie.
  it('satisfies the __Host- requirements in production', () => {
    const options = sessionCookieOptions('production');

    expect(options).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
    expect(options).not.toHaveProperty('domain');
  });

  it('is not Secure in development (plain http)', () => {
    expect(sessionCookieOptions('development').secure).toBe(false);
  });
});

describe('session cookie over HTTP', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function createApp(nodeEnv: string): Promise<NestExpressApplication> {
    vi.stubEnv('NODE_ENV', nodeEnv);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: RequestMagicLinkUseCase, useValue: {} },
        {
          provide: VerifyMagicLinkUseCase,
          useValue: {
            execute: () =>
              Promise.resolve({ sessionToken: 'jwt', userId: 'u1' }),
          },
        },
        { provide: LogoutUseCase, useValue: { execute: () => undefined } },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTH_BASE_URL: 'https://auth.sloboda.fr',
          }),
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = { id: 'u1' };
          return true;
        },
      })
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    return app;
  }

  const sameOrigin = { 'Sec-Fetch-Site': 'same-origin' };

  it('sets __Host-auth_session with Secure and Path=/ in production', async () => {
    const app = await createApp('production');

    const response = await request(app.getHttpServer())
      .post('/auth/callback')
      .set(sameOrigin)
      .send({ token: 'magic' })
      .expect(201);

    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^__Host-auth_session=jwt;/);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('Domain');
    await app.close();
  });

  it('clears __Host-auth_session with Secure and Path=/ on logout in production', async () => {
    const app = await createApp('production');

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set(sameOrigin)
      .expect(204);

    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^__Host-auth_session=;/);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    await app.close();
  });

  it('keeps auth_session, not Secure, in development', async () => {
    const app = await createApp('development');

    const response = await request(app.getHttpServer())
      .post('/auth/callback')
      .set(sameOrigin)
      .send({ token: 'magic' })
      .expect(201);

    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^auth_session=jwt;/);
    expect(cookie).not.toContain('Secure');
    await app.close();
  });
});
