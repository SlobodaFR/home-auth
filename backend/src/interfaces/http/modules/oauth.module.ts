import { Module } from '@nestjs/common';
import { AuthorizeUseCase } from '../../../application/auth/authorize.use-case';
import { ExchangeCodeUseCase } from '../../../application/auth/exchange-code.use-case';
import { RefreshTokenUseCase } from '../../../application/auth/refresh-token.use-case';
import { GetUserInfoUseCase } from '../../../application/profile/get-user-info.use-case';
import { OAuthController } from '../controllers/oauth.controller';

@Module({
  controllers: [OAuthController],
  providers: [AuthorizeUseCase, ExchangeCodeUseCase, RefreshTokenUseCase, GetUserInfoUseCase],
})
export class OAuthModule {}
