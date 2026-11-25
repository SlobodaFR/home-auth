import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import {
  RpLogoutResult,
  RpLogoutUseCase,
} from '../../../application/auth/rp-logout.use-case';
import { RpLogoutDto, RpLogoutResponseDto } from '../dto/rp-logout.dto';
import { SameOriginGuard } from '../guards/same-origin.guard';
import {
  SESSION_SECURITY_SCHEME,
  sessionCookieName,
  sessionCookieOptions,
} from '../session-cookie';

const HINT_MAX_LENGTH = 4096;

function single(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function header(req: Request, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Navigation that the user's browser really performs: not a prefetch, prerender or subresource. */
function isRealNavigation(req: Request): boolean {
  if (req.method !== 'GET') {
    return false;
  }
  if (
    header(req, 'sec-fetch-mode') !== 'navigate' ||
    header(req, 'sec-fetch-dest') !== 'document'
  ) {
    return false;
  }
  const purpose = `${header(req, 'sec-purpose')} ${header(req, 'purpose')}`;
  return !/prefetch|prerender/i.test(purpose);
}

/** PC10: service-initiated logout (RP-initiated), behind the auth-rp-initiated-logout flag. */
@ApiTags('Auth')
@Controller()
export class RpLogoutController {
  constructor(
    private readonly rpLogout: RpLogoutUseCase,
    private readonly config: ConfigService,
  ) {}

  @Get('logout')
  @ApiCookieAuth(SESSION_SECURITY_SCHEME)
  @ApiOperation({
    summary:
      'Service-initiated logout: ends the SSO session of this browser only, then redirects',
  })
  @ApiQuery({ name: 'client_id' })
  @ApiQuery({ name: 'post_logout_redirect_uri' })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'access_token_hint', required: false })
  @ApiResponse({
    status: 302,
    description:
      'Redirect to post_logout_redirect_uri, to the confirmation screen, or to /error',
  })
  @ApiResponse({ status: 404, description: 'Feature flag off' })
  async logout(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const state = single(query.state);
    const hint = single(query.access_token_hint);
    const params = {
      clientId: single(query.client_id),
      postLogoutRedirectUri: single(query.post_logout_redirect_uri),
      state: query.state === undefined ? undefined : state,
    };
    const cookies = req.cookies as Record<string, string | undefined>;
    const result = await this.rpLogout.begin({
      ...params,
      sessionCookie: cookies[sessionCookieName()],
      hint: hint && hint.length <= HINT_MAX_LENGTH ? hint : undefined,
      isNavigation: isRealNavigation(req),
    });

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    if (result.kind === 'invalid') {
      const errorUrl = new URL('/error', frontendUrl);
      errorUrl.searchParams.set('reason', result.reason);
      res.redirect(errorUrl.toString());
      return;
    }
    if (result.kind === 'confirm') {
      // The hint never goes further than this request: it would end up in the SPA's history.
      const confirmUrl = new URL('/logout/confirm', frontendUrl);
      confirmUrl.searchParams.set('client_id', params.clientId);
      confirmUrl.searchParams.set(
        'post_logout_redirect_uri',
        params.postLogoutRedirectUri,
      );
      if (params.state !== undefined) {
        confirmUrl.searchParams.set('state', params.state);
      }
      res.redirect(confirmUrl.toString());
      return;
    }
    // Same Secure/Path as when it was set: required to clear a __Host- cookie.
    res.clearCookie(sessionCookieName(), sessionCookieOptions());
    res.redirect(result.redirectTo);
  }

  @Post('auth/rp-logout')
  @HttpCode(200)
  // Not SessionAuthGuard: an expired session still gets its redirect (idempotent).
  @UseGuards(SameOriginGuard)
  @ApiCookieAuth(SESSION_SECURITY_SCHEME)
  @ApiOperation({
    summary:
      'Confirm a service-initiated logout (confirmation screen): clears the cookie of this browser',
  })
  @ApiResponse({ status: 200, type: RpLogoutResponseDto })
  @ApiResponse({ status: 404, description: 'Feature flag off' })
  async confirm(
    @Body() dto: RpLogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ redirect_to: string }> {
    res.setHeader('Cache-Control', 'no-store');
    const cookies = req.cookies as Record<string, string | undefined>;
    const result: RpLogoutResult = await this.rpLogout.confirm({
      clientId: dto.client_id,
      postLogoutRedirectUri: dto.post_logout_redirect_uri,
      state: dto.state,
      sessionCookie: cookies[sessionCookieName()],
    });
    if (result.kind !== 'redirect') {
      throw new BadRequestException('Invalid logout request');
    }
    res.clearCookie(sessionCookieName(), sessionCookieOptions());
    return { redirect_to: result.redirectTo };
  }
}
