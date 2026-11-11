import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FakeTelemetry } from '../../../application/test/in-memory-repositories';
import { OAuthController } from './oauth.controller';

const QUERY = {
  client_id: 'budget',
  redirect_uri: 'https://budget.example.com/cb',
  state: 'xyz',
};

function createController(options: {
  session: boolean;
  authorize: () => Promise<string>;
}) {
  const telemetry = new FakeTelemetry();
  const controller = new OAuthController(
    { execute: options.authorize } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      verify: () => Promise.resolve(options.session ? 'user-1' : null),
    } as never,
    { findById: () => Promise.resolve({ id: 'user-1' }) } as never,
    { get: (_key: string, fallback: string) => fallback } as never,
    telemetry,
  );
  const req = {
    cookies: { auth_session: 'jwt' },
    originalUrl: '/authorize?client_id=budget',
  } as unknown as Request;
  const res = { redirect: jest.fn() } as unknown as Response;
  return { controller, telemetry, req, res };
}

describe('OAuthController.authorize telemetry', () => {
  it('reports login_required without a session', async () => {
    const { controller, telemetry, req, res } = createController({
      session: false,
      authorize: () => Promise.resolve('c'),
    });

    await controller.authorize(QUERY, req, res);

    expect(telemetry.captured).toEqual([
      {
        event: {
          name: 'authorize',
          properties: { outcome: 'login_required' },
        },
      },
    ]);
  });

  it('reports a delivered code for the signed-in user', async () => {
    const { controller, telemetry, req, res } = createController({
      session: true,
      authorize: () => Promise.resolve('c'),
    });

    await controller.authorize(QUERY, req, res);

    expect(telemetry.captured).toEqual([
      {
        event: {
          name: 'authorize',
          properties: { client_id: 'budget', outcome: 'code' },
        },
        userId: 'user-1',
      },
    ]);
  });

  it.each([
    [
      'forbidden',
      new ForbiddenException(),
      { client_id: 'budget', outcome: 'forbidden' },
    ],
    // The client was not resolved: client_id is caller-supplied text and is not sent.
    ['unknown_client', new NotFoundException(), { outcome: 'unknown_client' }],
    [
      'invalid_request',
      new BadRequestException(),
      { outcome: 'invalid_request' },
    ],
  ])('reports %s', async (_outcome, error, properties) => {
    const { controller, telemetry, req, res } = createController({
      session: true,
      authorize: () => Promise.reject(error),
    });

    await controller.authorize(QUERY, req, res);

    expect(telemetry.captured).toEqual([
      {
        event: {
          name: 'authorize',
          properties,
        },
        userId: 'user-1',
      },
    ]);
  });
});
