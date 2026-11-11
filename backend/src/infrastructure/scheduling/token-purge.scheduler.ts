import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PurgeExpiredTokensUseCase } from '../../application/auth/purge-expired-tokens.use-case';

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Runs the expired-token purge at startup, then every six hours. A failure is logged, never thrown. */
@Injectable()
export class TokenPurgeScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TokenPurgeScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly purgeExpiredTokens: PurgeExpiredTokensUseCase) {}

  onApplicationBootstrap(): void {
    this.run();
    this.timer = setInterval(() => {
      this.run();
    }, PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private run(): void {
    this.purgeExpiredTokens
      .execute()
      .then(({ magicLinks, authorizationCodes, refreshTokens }) => {
        this.logger.log(
          `Purged expired tokens: ${magicLinks.toString()} magic links, ${authorizationCodes.toString()} authorization codes, ${refreshTokens.toString()} refresh tokens`,
        );
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Token purge failed (${error instanceof Error ? error.name : 'unknown error'})`,
        );
      });
  }
}
