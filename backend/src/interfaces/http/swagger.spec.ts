import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SESSION_SECURITY_SCHEME } from './session-cookie';
import { setupSwagger } from './swagger';

@Controller('ping')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
class PingController {
  @Get()
  ping(): string {
    return 'pong';
  }
}

async function createApp(nodeEnv: string): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupSwagger(app, nodeEnv);
  await app.init();
  return app;
}

describe('setupSwagger', () => {
  it('does not expose the API documentation in production', async () => {
    const app = await createApp('production');

    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer()).get('/docs-json').expect(404);
    await app.close();
  });

  it('serves it outside production', async () => {
    const app = await createApp('development');

    await request(app.getHttpServer()).get('/docs').expect(200);
    await request(app.getHttpServer()).get('/docs-json').expect(200);
    await app.close();
  });

  it('documents the session cookie under the name the guard reads', async () => {
    const app = await createApp('development');

    const { body } = await request(app.getHttpServer()).get('/docs-json');

    expect(body.components.securitySchemes[SESSION_SECURITY_SCHEME]).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'auth_session',
    });
    expect(body.paths['/ping'].get.security).toEqual([
      { [SESSION_SECURITY_SCHEME]: [] },
    ]);
    await app.close();
  });
});
