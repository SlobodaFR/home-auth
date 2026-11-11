import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GetUserInfoUseCase } from '../../application/profile/get-user-info.use-case';
import { UpdateProfileUseCase } from '../../application/profile/update-profile.use-case';
import { UploadAvatarUseCase } from '../../application/profile/upload-avatar.use-case';
import { ProfileController } from './controllers/profile.controller';
import { SessionAuthGuard } from './guards/session-auth.guard';

const PNG = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array<number>(1024).fill(0),
]);

describe('POST /profile/avatar (upload limits)', () => {
  let app: NestExpressApplication;
  const execute = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    execute.mockClear();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: UploadAvatarUseCase, useValue: { execute } },
        { provide: GetUserInfoUseCase, useValue: {} },
        { provide: UpdateProfileUseCase, useValue: {} },
        { provide: ConfigService, useValue: new ConfigService({}) },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: unknown }>().user = {
            id: 'user-1',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers 413 past 2 MB without reaching the use case', async () => {
    await request(app.getHttpServer())
      .post('/profile/avatar')
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('avatar', Buffer.alloc(3 * 1024 * 1024), 'a.png')
      .expect(413);

    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects more than one file', async () => {
    await request(app.getHttpServer())
      .post('/profile/avatar')
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('avatar', PNG, 'a.png')
      .attach('avatar', PNG, 'b.png')
      .expect(400);

    expect(execute).not.toHaveBeenCalled();
  });

  it('accepts a small image and passes only its bytes on', async () => {
    await request(app.getHttpServer())
      .post('/profile/avatar')
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('avatar', PNG, 'a.png')
      .expect(204);

    expect(execute).toHaveBeenCalledWith('user-1', expect.any(Buffer));
  });
});
