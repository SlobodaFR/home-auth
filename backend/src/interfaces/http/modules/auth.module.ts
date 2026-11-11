import { Module } from '@nestjs/common';
import { LogoutUseCase } from '../../../application/auth/logout.use-case';
import { RequestMagicLinkUseCase } from '../../../application/auth/request-magic-link.use-case';
import { VerifyMagicLinkUseCase } from '../../../application/auth/verify-magic-link.use-case';
import { AuthController } from '../controllers/auth.controller';
import { HealthController } from '../controllers/health.controller';
import { JwksController } from '../controllers/jwks.controller';

@Module({
  controllers: [AuthController, JwksController, HealthController],
  providers: [RequestMagicLinkUseCase, VerifyMagicLinkUseCase, LogoutUseCase],
})
export class AuthModule {}
