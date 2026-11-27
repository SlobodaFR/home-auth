import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LogoutUseCase } from '../../../application/auth/logout.use-case';
import { RequestMagicLinkUseCase } from '../../../application/auth/request-magic-link.use-case';
import { RpLogoutUseCase } from '../../../application/auth/rp-logout.use-case';
import { VerifyMagicLinkUseCase } from '../../../application/auth/verify-magic-link.use-case';
import { AuthController } from '../controllers/auth.controller';
import { HealthController } from '../controllers/health.controller';
import { RpLogoutController } from '../controllers/rp-logout.controller';
import { applyRpLogoutNoStore } from '../rp-logout-no-store.middleware';
import { JwksController } from '../controllers/jwks.controller';
import { VersionController } from '../controllers/version.controller';

@Module({
  controllers: [
    AuthController,
    RpLogoutController,
    JwksController,
    HealthController,
    VersionController,
  ],
  providers: [
    RequestMagicLinkUseCase,
    VerifyMagicLinkUseCase,
    LogoutUseCase,
    RpLogoutUseCase,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    applyRpLogoutNoStore(consumer);
  }
}
