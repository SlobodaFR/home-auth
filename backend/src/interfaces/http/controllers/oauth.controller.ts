import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthorizeUseCase } from '../../../application/auth/authorize.use-case';
import { ExchangeCodeUseCase, TokenPair } from '../../../application/auth/exchange-code.use-case';
import { RefreshTokenUseCase } from '../../../application/auth/refresh-token.use-case';
import { GetUserInfoUseCase, UserInfo } from '../../../application/profile/get-user-info.use-case';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthorizeQueryDto } from '../dto/authorize-query.dto';
import { TokenRequestDto } from '../dto/token-request.dto';
import { AccessTokenGuard, AccessTokenRequest } from '../guards/access-token.guard';
import { SessionAuthGuard, SessionUser } from '../guards/session-auth.guard';
import { TokenPairDto } from '../presenters/token-pair.dto';
import { UserInfoDto } from '../presenters/user-info.dto';

@ApiTags('OAuth2')
@Controller()
export class OAuthController {
  constructor(
    private readonly authorizeUseCase: AuthorizeUseCase,
    private readonly exchangeCodeUseCase: ExchangeCodeUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly getUserInfo: GetUserInfoUseCase,
  ) {}

  @Get('authorize')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth('auth_session')
  @ApiOperation({ summary: 'Start the OAuth2 Authorization Code flow', description: 'Redirects to redirect_uri with an authorization code' })
  @ApiResponse({ status: 302, description: 'Redirect to redirect_uri?code=...' })
  async authorize(
    @Query() query: AuthorizeQueryDto,
    @CurrentUser() user: SessionUser,
    @Res() res: Response,
  ): Promise<void> {
    const code = await this.authorizeUseCase.execute({
      userId: user.id,
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
    });

    const redirectUrl = new URL(query.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    res.redirect(redirectUrl.toString());
  }

  @Post('token')
  @ApiOperation({ summary: 'Exchange an authorization code or refresh token for an access token' })
  @ApiResponse({ status: 200, type: TokenPairDto })
  async token(@Body() dto: TokenRequestDto): Promise<TokenPair> {
    if (dto.grant_type === 'authorization_code') {
      if (!dto.code || !dto.redirect_uri) {
        throw new BadRequestException('code and redirect_uri are required');
      }
      return this.exchangeCodeUseCase.execute({
        code: dto.code,
        clientId: dto.client_id,
        clientSecret: dto.client_secret,
        redirectUri: dto.redirect_uri,
      });
    }

    if (!dto.refresh_token) {
      throw new BadRequestException('refresh_token is required');
    }
    return this.refreshTokenUseCase.execute({
      refreshToken: dto.refresh_token,
      clientId: dto.client_id,
      clientSecret: dto.client_secret,
    });
  }

  @Get('userinfo')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get information about the authenticated user' })
  @ApiResponse({ status: 200, type: UserInfoDto })
  async userinfo(@Req() req: AccessTokenRequest): Promise<UserInfo> {
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.getUserInfo.execute(req.user.sub);
  }
}
