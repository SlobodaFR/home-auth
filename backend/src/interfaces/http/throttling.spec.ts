import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { LogoutUseCase } from '../../application/auth/logout.use-case';
import { RequestMagicLinkUseCase } from '../../application/auth/request-magic-link.use-case';
import { VerifyMagicLinkUseCase } from '../../application/auth/verify-magic-link.use-case';
import { SessionService } from '../../domain/auth/session.service';
import { UserRepository } from '../../domain/user/user.repository';
import { AuthController } from './controllers/auth.controller';
import { THROTTLE_ERROR_MESSAGE, throttlerOptions } from './throttling';

describe('Rate limiting (HTTP)', () => {
  let app: NestExpressApplication;

  async function createApp(
    trustProxyHops: number,
  ): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions)],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: RequestMagicLinkUseCase,
          useValue: {
            execute: vi
              .fn<RequestMagicLinkUseCase['execute']>()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: VerifyMagicLinkUseCase,
          useValue: { execute: vi.fn<VerifyMagicLinkUseCase['execute']>() },
        },
        {
          provide: LogoutUseCase,
          useValue: { execute: vi.fn<LogoutUseCase['execute']>() },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn<(key: string) => unknown>() },
        },
        { provide: SessionService, useValue: {} },
        { provide: UserRepository, useValue: {} },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    if (trustProxyHops > 0) {
      nestApp.set('trust proxy', trustProxyHops);
    }
    nestApp.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    await app.close();
  });

  const requestLink = (ip: string, n = 0) =>
    request(app.getHttpServer())
      .post('/auth/request-link')
      .set('X-Forwarded-For', ip)
      .send({ email: `user${String(n)}@example.com` });

  it('answers 429 with a French message after 20 magic-link requests per hour from one IP', async () => {
    app = await createApp(1);
    for (let i = 0; i < 20; i++) {
      await requestLink('203.0.113.1', i).expect(204);
    }

    const blocked = await requestLink('203.0.113.1').expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      message: THROTTLE_ERROR_MESSAGE,
    });
    expect(blocked.headers['retry-after']).toBeDefined();

    await requestLink('203.0.113.2').expect(204);
  });

  it('groups IPv6 clients by /64', async () => {
    app = await createApp(1);
    for (let i = 0; i < 20; i++) {
      await requestLink(`2001:db8:1:2::${i.toString(16)}`, i).expect(204);
    }

    const sameSubnet = await requestLink('2001:db8:1:2:ffff::1');
    const otherSubnet = await requestLink('2001:db8:1:3::1');
    expect(sameSubnet.status).toBe(429);
    expect(otherSubnet.status).toBe(204);
  });

  it('ignores X-Forwarded-For when no proxy is trusted', async () => {
    app = await createApp(0);
    for (let i = 0; i < 20; i++) {
      await requestLink(`198.51.100.${String(i)}`, i).expect(204);
    }

    const blocked = await requestLink('198.51.100.200');
    expect(blocked.status).toBe(429);
  });
});
