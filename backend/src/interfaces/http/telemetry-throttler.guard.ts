import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';
import { Telemetry } from '../../domain/shared/telemetry';
import { routeOf } from './route-of';

/** ThrottlerGuard that also reports each rejected request (rate_limited). */
@Injectable()
export class TelemetryThrottlerGuard extends ThrottlerGuard {
  @Inject(Telemetry) private readonly telemetry!: Telemetry;

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    this.telemetry.capture({
      name: 'rate_limited',
      properties: {
        route: routeOf(context.switchToHttp().getRequest<Request>()),
      },
    });
    await super.throwThrottlingException(context, detail);
  }
}
