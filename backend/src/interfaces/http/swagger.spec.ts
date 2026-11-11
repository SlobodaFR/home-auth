import { Controller, Get } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { setupSwagger } from './swagger';

@Controller('ping')
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
});
