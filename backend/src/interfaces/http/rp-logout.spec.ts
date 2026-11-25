import {
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ResolveSessionUseCase } from '../../application/auth/resolve-session.use-case';
import {
  RP_LOGOUT_FLAG,
  RpLogoutUseCase,
} from '../../application/auth/rp-logout.use-case';
import {
  FakeFeatureFlags,
  FakeSessionService,
  FakeTelemetry,
  FakeTokenService,
  InMemoryClientRepository,
  InMemoryUserRepository,
} from '../../application/test/in-memory-repositories';
import { SessionService } from '../../domain/auth/session.service';
import { TokenService } from '../../domain/auth/token.service';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { Telemetry } from '../../domain/shared/telemetry';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';
import { applyRpLogoutNoStore } from './rp-logout-no-store.middleware';
import { RpLogoutController } from './controllers/rp-logout.controller';
import { SameOriginGuard } from './guards/same-origin.guard';
import { sessionCookieName } from './session-cookie';

const NAVIGATE = {
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Site': 'cross-site',
};
const URI = 'https://budget.sloboda.fr/bye';

describe('Service-initiated logout PC10 (HTTP)', () => {
  let app: NestExpressApplication;
  let flags: FakeFeatureFlags;
  let users: InMemoryUserRepository;
  let session: string;
  let hint: string;

  beforeEach(async () => {
    flags = new FakeFeatureFlags();
    flags.values.set(RP_LOGOUT_FLAG, true);
    users = new InMemoryUserRepository();
    const clients = new InMemoryClientRepository();
    const sessions = new FakeSessionService();
    const tokens = new FakeTokenService();
    await clients.save(
      Client.create({
        id: 'budget',
        name: 'Budget',
        clientSecretHash: 'h',
        redirectUris: ['https://budget.sloboda.fr/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    await users.save(
      User.create({
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    session = await sessions.sign('u1', 0);
    hint = await tokens.signAccessToken({
      sub: 'u1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: false,
      aud: 'budget',
    });
    @Module({
      controllers: [RpLogoutController],
      providers: [
        RpLogoutUseCase,
        ResolveSessionUseCase,
        SameOriginGuard,
        { provide: ClientRepository, useValue: clients },
        { provide: UserRepository, useValue: users },
        { provide: SessionService, useValue: sessions },
        { provide: TokenService, useValue: tokens },
        { provide: FeatureFlags, useValue: flags },
        { provide: Telemetry, useValue: new FakeTelemetry() },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTH_BASE_URL: 'https://auth.sloboda.fr',
            FRONTEND_URL: 'https://auth.sloboda.fr',
          }),
        },
      ],
    })
    class TestModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        applyRpLogoutNoStore(consumer);
      }
    }
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const cookie = () => `${sessionCookieName()}=${session}`;
  const query = (extra: Record<string, string> = {}) => ({
    client_id: 'budget',
    post_logout_redirect_uri: URI,
    state: 's1',
    ...extra,
  });
  const clearsCookie = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[] | undefined)?.some((c) =>
      c.startsWith(`${sessionCookieName()}=;`),
    ) ?? false;

  describe('GET /logout', () => {
    it('is a 404 when the flag is off', async () => {
      flags.values.set(RP_LOGOUT_FLAG, false);
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(query())
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(clearsCookie(res)).toBe(false);
    });

    it('logs out and redirects with a valid hint on a real navigation', async () => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(query({ access_token_hint: hint }))
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${URI}?state=s1`);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(clearsCookie(res)).toBe(true);
    });

    it('does not bump the session version: other devices stay logged in', async () => {
      await request(app.getHttpServer())
        .get('/logout')
        .query(query({ access_token_hint: hint }))
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect((await users.findById('u1'))?.sessionVersion).toBe(0);
    });

    it('goes to the confirmation screen without a hint, keeping the cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(query())
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect(res.status).toBe(302);
      const location = new URL(res.headers.location);
      expect(location.origin + location.pathname).toBe(
        'https://auth.sloboda.fr/logout/confirm',
      );
      expect(location.searchParams.get('client_id')).toBe('budget');
      expect(location.searchParams.get('post_logout_redirect_uri')).toBe(URI);
      expect(location.searchParams.get('state')).toBe('s1');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(clearsCookie(res)).toBe(false);
    });

    it('never forwards the hint to the confirmation screen', async () => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(query({ access_token_hint: `${hint}x` }))
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect(res.headers.location).not.toContain('hint');
      expect(res.headers.location).not.toContain('sub');
    });

    it.each([
      ['no Sec-Fetch headers', {}],
      [
        'a fetch() call',
        { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' },
      ],
      ['an <img>', { 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'image' }],
      ['a prefetch', { ...NAVIGATE, 'Sec-Purpose': 'prefetch' }],
      ['a prerender', { ...NAVIGATE, 'Sec-Purpose': 'prefetch;prerender' }],
      ['a legacy prefetch', { ...NAVIGATE, Purpose: 'prefetch' }],
    ])('only asks for confirmation on %s', async (_l, headers) => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(query({ access_token_hint: hint }))
        .set('Cookie', cookie())
        .set(headers);
      expect(res.headers.location).toContain('/logout/confirm');
      expect(clearsCookie(res)).toBe(false);
    });

    it('never logs out on HEAD', async () => {
      const res = await request(app.getHttpServer())
        .head('/logout')
        .query(query({ access_token_hint: hint }))
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect(res.headers.location).toContain('/logout/confirm');
      expect(clearsCookie(res)).toBe(false);
    });

    it('redirects safely without a session (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(query())
        .set(NAVIGATE);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${URI}?state=s1`);
    });

    it('omits state when none was sent', async () => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query({ client_id: 'budget', post_logout_redirect_uri: URI })
        .set(NAVIGATE);
      expect(res.headers.location).toBe(URI);
    });

    it.each([
      ['unknown client', query({ client_id: 'nope' }), 'unknown_client'],
      [
        'foreign redirect URI',
        query({ post_logout_redirect_uri: 'https://evil.example/' }),
        'invalid_request',
      ],
      [
        'userinfo trick',
        query({
          post_logout_redirect_uri: 'https://budget.sloboda.fr@evil.example/',
        }),
        'invalid_request',
      ],
      [
        'missing client_id',
        { post_logout_redirect_uri: URI },
        'invalid_request',
      ],
      ['missing uri', { client_id: 'budget' }, 'invalid_request'],
      [
        'repeated state',
        'client_id=budget&post_logout_redirect_uri=' +
          encodeURIComponent(URI) +
          '&state=a&state=b',
        'invalid_request',
      ],
      [
        'array parameter',
        'client_id=budget&client_id=x&post_logout_redirect_uri=' +
          encodeURIComponent(URI),
        'invalid_request',
      ],
    ])('sends %s to /error, never to the URI', async (_l, q, reason) => {
      const res = await request(app.getHttpServer())
        .get('/logout')
        .query(q)
        .set('Cookie', cookie())
        .set(NAVIGATE);
      expect(res.status).toBe(302);
      const location = new URL(res.headers.location);
      expect(location.pathname).toBe('/error');
      expect(location.searchParams.get('reason')).toBe(reason);
      expect(location.origin).toBe('https://auth.sloboda.fr');
      expect(clearsCookie(res)).toBe(false);
    });
  });

  describe('POST /auth/rp-logout', () => {
    const post = (body: object, headers: Record<string, string> = {}) =>
      request(app.getHttpServer())
        .post('/auth/rp-logout')
        .set('Sec-Fetch-Site', 'same-origin')
        .set(headers)
        .send(body);
    const body = {
      client_id: 'budget',
      post_logout_redirect_uri: URI,
      state: 's1',
    };

    it('clears the cookie and returns the server-built redirect', async () => {
      const res = await post(body, { Cookie: cookie() });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ redirect_to: `${URI}?state=s1` });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(clearsCookie(res)).toBe(true);
    });

    it('works without a valid session (no 401: the screen would be stuck)', async () => {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ redirect_to: `${URI}?state=s1` });
    });

    it('refuses a cross-origin request', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/rp-logout')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Cookie', cookie())
        .send(body);
      expect(res.status).toBe(403);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(clearsCookie(res)).toBe(false);
    });

    it('refuses a form-encoded body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/rp-logout')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', cookie())
        .type('form')
        .send(body);
      expect(res.status).toBe(415);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it.each([
      [
        'foreign URI',
        { ...body, post_logout_redirect_uri: 'https://evil.fr/' },
      ],
      ['unknown client', { ...body, client_id: 'nope' }],
      ['missing field', { client_id: 'budget' }],
      ['huge client_id', { ...body, client_id: 'a'.repeat(5000) }],
      ['oversized state', { ...body, state: 'a'.repeat(513) }],
    ])('answers 400 and keeps the cookie on %s', async (_l, b) => {
      const res = await post(b, { Cookie: cookie() });
      expect(res.status).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(clearsCookie(res)).toBe(false);
    });

    it('is a 404 when the flag is off', async () => {
      flags.values.set(RP_LOGOUT_FLAG, false);
      const res = await post(body, { Cookie: cookie() });
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});
