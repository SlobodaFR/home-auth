import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GetAvatarUseCase } from '../../application/profile/get-avatar.use-case';
import { AvatarsController } from './controllers/avatars.controller';

describe('GET /avatars/:userId', () => {
  it('serves a stored avatar with safe headers', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AvatarsController],
      providers: [
        {
          provide: GetAvatarUseCase,
          useValue: {
            execute: () =>
              Promise.resolve({
                kind: 'stored',
                avatar: {
                  contentType: 'image/png',
                  body: Buffer.from([0x89, 0x50]),
                },
              }),
          },
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/avatars/user-1')
      .expect(200);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe('inline');
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    await app.close();
  });
});
