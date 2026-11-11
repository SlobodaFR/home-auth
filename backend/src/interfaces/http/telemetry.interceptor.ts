import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { Telemetry } from '../../domain/shared/telemetry';
import { routeOf } from './route-of';

/** Polled (client apps, Docker healthcheck): high volume, no debugging value. */
const UNREPORTED_ROUTES = new Set(['/.well-known/jwks.json', '/healthz']);

/** Reports every request handled by a Nest route (http_request); 5xx details come from ServerErrorTelemetryFilter. */
@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  constructor(private readonly telemetry: Telemetry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (UNREPORTED_ROUTES.has(routeOf(req))) {
      return next.handle();
    }
    const startedAt = performance.now();
    const report = (status: number) => {
      this.telemetry.capture({
        name: 'http_request',
        properties: {
          route: routeOf(req),
          method: req.method,
          status,
          duration_ms: Math.round(performance.now() - startedAt),
        },
      });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          report(res.statusCode);
        },
        // The exception filter writes the response later: derive the status from the error.
        error: (error: unknown) => {
          report(error instanceof HttpException ? error.getStatus() : 500);
        },
      }),
    );
  }
}
