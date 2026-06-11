import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenClaims, TokenService } from '../../../domain/auth/token.service';

const BEARER_PREFIX = 'Bearer ';

export interface AccessTokenRequest extends Request {
  user?: AccessTokenClaims;
}

/** Authenticates OAuth2 client requests via a bearer access token. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccessTokenRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.tokenService.verifyAccessToken(header.slice(BEARER_PREFIX.length));
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = claims;
    return true;
  }
}
