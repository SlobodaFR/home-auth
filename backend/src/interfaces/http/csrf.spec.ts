import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InviteUserUseCase } from '../../application/admin/invite-user.use-case';
import { ListUsersUseCase } from '../../application/admin/list-users.use-case';
import { UpdateUserUseCase } from '../../application/admin/update-user.use-case';
import { User } from '../../domain/user/user';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminGuard } from './guards/admin.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';

describe('CSRF protection on admin routes (HTTP)', () => {
  let app: NestExpressApplication;
  const invite = vi.fn<InviteUserUseCase['execute']>();

  beforeEach(async () => {
    invite.mockReset().mockResolvedValue(
      User.create({
        id: 'u2',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: InviteUserUseCase, useValue: { execute: invite } },
        { provide: ListUsersUseCase, useValue: {} },
        { provide: UpdateUserUseCase, useValue: {} },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTH_BASE_URL: 'https://auth.sloboda.fr',
          }),
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses a form posted from another sloboda.fr subdomain', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Origin', 'https://evil.sloboda.fr')
      .type('form')
      .send('email=alice@example.com&name=Alice');

    expect([403, 415]).toContain(response.status);
    expect(invite).not.toHaveBeenCalled();
  });

  it('refuses a same-site request even with JSON', async () => {
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Sec-Fetch-Site', 'same-site')
      .send({ email: 'alice@example.com', name: 'Alice' })
      .expect(403);

    expect(invite).not.toHaveBeenCalled();
  });

  it('accepts the SPA request', async () => {
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'alice@example.com', name: 'Alice' })
      .expect(201);

    expect(invite).toHaveBeenCalled();
  });
});
