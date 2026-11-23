import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InviteUserUseCase } from '../../application/admin/invite-user.use-case';
import { ListUsersUseCase } from '../../application/admin/list-users.use-case';
import { RevokeUserSessionsUseCase } from '../../application/admin/revoke-user-sessions.use-case';
import { UpdateUserUseCase } from '../../application/admin/update-user.use-case';
import { LogoutUseCase } from '../../application/auth/logout.use-case';
import { InMemoryUserRepository } from '../../application/test/in-memory-repositories';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminGuard } from './guards/admin.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';

describe('POST /admin/users/:id/revoke-sessions (HTTP)', () => {
  let app: NestExpressApplication;
  const logout = vi.fn<LogoutUseCase['execute']>();

  async function createApp(admin: boolean) {
    logout.mockReset().mockResolvedValue();
    const users = new InMemoryUserRepository();
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
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: InviteUserUseCase, useValue: {} },
        { provide: ListUsersUseCase, useValue: {} },
        { provide: UpdateUserUseCase, useValue: {} },
        { provide: UserRepository, useValue: users },
        { provide: LogoutUseCase, useValue: { execute: logout } },
        RevokeUserSessionsUseCase,
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
      .useValue({ canActivate: () => admin })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }

  afterEach(async () => {
    await app.close();
  });

  const post = (path: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Sec-Fetch-Site', 'same-origin');

  it('answers 204 and runs the logout of that user', async () => {
    await createApp(true);

    await post('/admin/users/u1/revoke-sessions').expect(204);

    expect(logout).toHaveBeenCalledExactlyOnceWith('u1');
  });

  it('answers 404 for an unknown user', async () => {
    await createApp(true);

    await post('/admin/users/nobody/revoke-sessions').expect(404);

    expect(logout).not.toHaveBeenCalled();
  });

  it('is refused to a non-admin', async () => {
    await createApp(false);

    await post('/admin/users/u1/revoke-sessions').expect(403);

    expect(logout).not.toHaveBeenCalled();
  });

  it('is refused from another sloboda.fr subdomain (CSRF)', async () => {
    await createApp(true);

    await request(app.getHttpServer())
      .post('/admin/users/u1/revoke-sessions')
      .set('Sec-Fetch-Site', 'same-site')
      .expect(403);

    expect(logout).not.toHaveBeenCalled();
  });
});
