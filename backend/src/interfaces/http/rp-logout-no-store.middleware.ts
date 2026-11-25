import { MiddlewareConsumer } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Runs before guards and pipes, so even the 400s of ValidationPipe, the 403s of the guards and
 * the 404s of the feature flag carry the header: these responses depend on the session cookie.
 */
export function noStoreMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function applyRpLogoutNoStore(consumer: MiddlewareConsumer): void {
  consumer.apply(noStoreMiddleware).forRoutes('logout', 'auth/rp-logout');
}
