import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { LogoutUseCase } from '../../../application/auth/logout.use-case';
import { RequestMagicLinkUseCase } from '../../../application/auth/request-magic-link.use-case';
import { VerifyMagicLinkUseCase } from '../../../application/auth/verify-magic-link.use-case';
import { SESSION_TTL } from '../../../domain/auth/session.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthCallbackDto } from '../dto/auth-callback.dto';
import { RequestMagicLinkDto } from '../dto/request-magic-link.dto';
import { SESSION_COOKIE_NAME, SessionAuthGuard, SessionUser } from '../guards/session-auth.guard';
import { AuthCallbackResponseDto } from '../presenters/auth-callback-response.dto';

const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL * 1000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly requestMagicLink: RequestMagicLinkUseCase,
    private readonly verifyMagicLink: VerifyMagicLinkUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post('request-link')
  @HttpCode(204)
  @ApiOperation({ summary: 'Send a magic-link sign-in email' })
  @ApiResponse({ status: 204, description: 'Email sent (if the address is known)' })
  async requestLink(@Body() dto: RequestMagicLinkDto): Promise<void> {
    await this.requestMagicLink.execute(dto.email);
  }

  @Post('callback')
  @ApiOperation({ summary: 'Exchange a magic-link token for a session cookie' })
  @ApiResponse({ status: 200, type: AuthCallbackResponseDto })
  async callback(
    @Body() dto: AuthCallbackDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ userId: string }> {
    const result = await this.verifyMagicLink.execute(dto.token);

    res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      path: '/',
    });

    return { userId: result.userId };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth('auth_session')
  @ApiOperation({ summary: 'Log out and clear the session cookie' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logoutUseCase.execute(user.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }
}
