import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { Telemetry } from '../../domain/shared/telemetry';
import { routeOf } from './route-of';

/**
 * Reports every 5xx (server_error) by error class only, never its message, then lets Nest answer
 * as usual. A filter (not the interceptor) so that errors thrown by guards are covered too.
 */
@Catch()
@Injectable()
export class ServerErrorTelemetryFilter extends BaseExceptionFilter {
  constructor(private readonly telemetry: Telemetry) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      this.telemetry.capture({
        name: 'server_error',
        properties: {
          route: routeOf(host.switchToHttp().getRequest<Request>()),
          error_name:
            exception instanceof Error
              ? exception.constructor.name
              : 'non_error',
        },
      });
    }
    super.catch(exception, host);
  }
}
