import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthorizeUseCase } from '../../../application/auth/authorize.use-case';
import { ExchangeCodeUseCase, TokenPair } from '../../../application/auth/exchange-code.use-case';
import { RefreshTokenUseCase } from '../../../application/auth/refresh-token.use-case';
import { GetUserInfoUseCase, UserInfo } from '../../../application/profile/get-user-info.use-case';
import { SessionService } from '../../../domain/auth/session.service';
import { UserRepository } from '../../../domain/user/user.repository';
import { AuthorizeQueryDto } from '../dto/authorize-query.dto';
import { TokenRequestDto } from '../dto/token-request.dto';
import { AccessTokenGuard, AccessTokenRequest } from '../guards/access-token.guard';
import { SESSION_COOKIE_NAME } from '../guards/session-auth.guard';
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
    private readonly sessionService: SessionService,
    private readonly userRepository: UserRepository,
    private readonly config: ConfigService,
  ) {}

  @Get('authorize')
  @ApiCookieAuth('auth_session')
  @ApiOperation({
    summary: 'Start the OAuth2 Authorization Code flow',
    description:
      'Redirects to redirect_uri with an authorization code. If the user has no active session, redirects to the login page first.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to redirect_uri?code=... or to the login page' })
  async authorize(@Query() query: AuthorizeQueryDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const userId = await this.getSessionUserId(req);
    if (!userId) {
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const loginUrl = new URL('/login', frontendUrl);
      loginUrl.searchParams.set('redirect', req.originalUrl);
      res.redirect(loginUrl.toString());
      return;
    }

    let code: string;
    try {
      code = await this.authorizeUseCase.execute({
        userId,
        clientId: query.client_id,
        redirectUri: query.redirect_uri,
      });
    } catch (error) {
      const reason =
        error instanceof ForbiddenException
          ? 'forbidden'
          : error instanceof NotFoundException
            ? 'unknown_client'
            : 'invalid_request';

      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const errorUrl = new URL('/error', frontendUrl);
      errorUrl.searchParams.set('reason', reason);
      errorUrl.searchParams.set('client', query.client_id);
      res.redirect(errorUrl.toString());
      return;
    }

    const redirectUrl = new URL(query.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    res.redirect(redirectUrl.toString());
  }

  private async getSessionUserId(req: Request): Promise<string | null> {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE_NAME];
    if (!token) {
      return null;
    }
    const userId = await this.sessionService.verify(token);
    if (!userId) {
      return null;
    }
    const user = await this.userRepository.findById(userId);
    return user ? user.id : null;
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
