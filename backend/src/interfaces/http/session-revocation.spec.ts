import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
import request from 'supertest';
import { LogoutUseCase } from '../../application/auth/logout.use-case';
import { RequestMagicLinkUseCase } from '../../application/auth/request-magic-link.use-case';
import { ResolveSessionUseCase } from '../../application/auth/resolve-session.use-case';
import { VerifyMagicLinkUseCase } from '../../application/auth/verify-magic-link.use-case';
import {
  FakeWebhookNotifier,
  InMemoryClientRepository,
  InMemoryRefreshTokenRepository,
} from '../../application/test/in-memory-repositories';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { SessionService } from '../../domain/auth/session.service';
import { ClientRepository } from '../../domain/client/client.repository';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';
import { JwtSessionService } from '../../infrastructure/auth/jwt-session.service';
import { RsaKeyProvider } from '../../infrastructure/auth/rsa-key-provider';
import { ENTITIES } from '../../infrastructure/persistence/entities';
import { TypeOrmUserRepository } from '../../infrastructure/persistence/repositories/typeorm-user.repository';
import { AuthController } from './controllers/auth.controller';
import { SameOriginGuard } from './guards/same-origin.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { sessionCookieName } from './session-cookie';

@Controller('whoami')
class WhoAmIController {
  @Get()
  @UseGuards(SessionAuthGuard)
  whoami(): { ok: true } {
    return { ok: true };
  }
}

// Real JWT signing, real SQLite repository, real guard: only the mail and webhook edges are fake.
describe('SSO session revocation (HTTP, end to end)', () => {
  let app: NestExpressApplication;
  let dir: string;
  let sessions: SessionService;
  let keys: RsaKeyProvider;
  let users: UserRepository;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'revocation-'));
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ENTITIES,
          synchronize: true,
        }),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      controllers: [AuthController, WhoAmIController],
      providers: [
        RsaKeyProvider,
        { provide: UserRepository, useClass: TypeOrmUserRepository },
        { provide: SessionService, useClass: JwtSessionService },
        {
          provide: RefreshTokenRepository,
          useValue: new InMemoryRefreshTokenRepository(),
        },
        {
          provide: ClientRepository,
          useValue: new InMemoryClientRepository(),
        },
        { provide: WebhookNotifier, useValue: new FakeWebhookNotifier() },
        { provide: RequestMagicLinkUseCase, useValue: {} },
        { provide: VerifyMagicLinkUseCase, useValue: {} },
        LogoutUseCase,
        ResolveSessionUseCase,
        SessionAuthGuard,
        SameOriginGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            DATABASE_PATH: join(dir, 'auth.sqlite'),
          }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    await app.init();
    sessions = app.get(SessionService);
    keys = app.get(RsaKeyProvider);
    users = app.get(UserRepository);
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
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const cookie = (token: string) => `${sessionCookieName()}=${token}`;
  const whoami = async (token: string) =>
    (
      await request(app.getHttpServer())
        .get('/whoami')
        .set('Cookie', cookie(token))
    ).status;
  const logout = async (token: string) =>
    (
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', cookie(token))
    ).status;

  it('accepts a session at the current version', async () => {
    expect(await whoami(await sessions.sign('u1', 0))).toBe(200);
  });

  it('logout kills the session on every device, a new login works again', async () => {
    const phone = await sessions.sign('u1', 0);
    const laptop = await sessions.sign('u1', 0);

    expect(await logout(phone)).toBe(204);

    expect(await whoami(phone)).toBe(401);
    expect(await whoami(laptop)).toBe(401);
    // The next login carries the new version.
    const user = await users.findById('u1');
    const fresh = await sessions.sign('u1', user?.sessionVersion ?? -1);
    expect(user?.sessionVersion).toBe(1);
    expect(await whoami(fresh)).toBe(200);
  });

  it('refuses a cookie issued before the sv claim existed (forced re-login)', async () => {
    const legacy = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: keys.getKeyId() })
      .setSubject('u1')
      .setAudience('auth-service-session')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(keys.getPrivateKey());

    expect(await whoami(legacy)).toBe(401);
  });

  it('refuses a session for a deleted user', async () => {
    expect(await whoami(await sessions.sign('ghost', 0))).toBe(401);
  });
});
