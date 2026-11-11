import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { FakeTelemetry } from '../../application/test/in-memory-repositories';
import { Telemetry } from '../../domain/shared/telemetry';
import { ServerErrorTelemetryFilter } from './server-error-telemetry.filter';
import { TelemetryThrottlerGuard } from './telemetry-throttler.guard';
import { TelemetryInterceptor } from './telemetry.interceptor';

@Controller('.well-known')
class JwksController {
  @Get('jwks.json')
  jwks(): { keys: [] } {
    return { keys: [] };
  }
}

@Controller('items')
class ItemsController {
  @Get('boom')
  boom(): never {
    throw new TypeError('secret detail about alice@example.com');
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException('nope');
  }

  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Get('limited')
  limited(): string {
    return 'ok';
  }

  @Get(':id')
  find(@Param('id') id: string): { id: string } {
    return { id };
  }
}

describe('HTTP telemetry', () => {
  let app: NestExpressApplication;
  let telemetry: FakeTelemetry;

  beforeEach(async () => {
    telemetry = new FakeTelemetry();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
      ],
      controllers: [ItemsController, JwksController],
      providers: [
        { provide: Telemetry, useValue: telemetry },
        { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
        { provide: APP_GUARD, useClass: TelemetryThrottlerGuard },
        { provide: APP_FILTER, useClass: ServerErrorTelemetryFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports each request with its parameterized route, never the raw URL or query', async () => {
    await request(app.getHttpServer())
      .get('/items/42?token=secret')
      .expect(200);

    expect(telemetry.names()).toEqual(['http_request']);
    const { properties } = telemetry.captured[0].event as {
      properties: Record<string, unknown>;
    };
    expect(properties).toEqual({
      route: '/items/:id',
      method: 'GET',
      status: 200,
      duration_ms: expect.any(Number),
    });
    expect(JSON.stringify(telemetry.captured)).not.toMatch(/42|secret/);
  });

  it('reports client errors with their status, without a server_error', async () => {
    await request(app.getHttpServer()).get('/items/missing').expect(404);

    expect(telemetry.names()).toEqual(['http_request']);
    expect(telemetry.captured[0].event).toMatchObject({
      properties: { route: '/items/missing', status: 404 },
    });
  });

  it('reports server errors by error class only, without the message', async () => {
    await request(app.getHttpServer()).get('/items/boom').expect(500);

    expect(telemetry.names().sort()).toEqual(['http_request', 'server_error']);
    const serverError = telemetry.captured.find(
      ({ event }) => event.name === 'server_error',
    );
    const httpRequest = telemetry.captured.find(
      ({ event }) => event.name === 'http_request',
    );
    expect(httpRequest?.event).toMatchObject({
      properties: { route: '/items/boom', status: 500 },
    });
    expect(serverError?.event).toEqual({
      name: 'server_error',
      properties: { route: '/items/boom', error_name: 'TypeError' },
    });
    expect(JSON.stringify(telemetry.captured)).not.toContain('alice');
  });

  it('does not report JWKS polling', async () => {
    await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200);

    expect(telemetry.captured).toEqual([]);
  });

  it('reports rate limiting with the route', async () => {
    await request(app.getHttpServer()).get('/items/limited').expect(200);
    await request(app.getHttpServer()).get('/items/limited').expect(429);

    expect(telemetry.captured.map(({ event }) => event)).toContainEqual({
      name: 'rate_limited',
      properties: { route: '/items/limited' },
    });
  });
});
