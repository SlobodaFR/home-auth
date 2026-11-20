import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AccessTokenClaims,
  TokenService,
} from '../../../domain/auth/token.service';
import { ClientRepository } from '../../../domain/client/client.repository';

const BEARER_PREFIX = 'Bearer ';

export interface AccessTokenRequest extends Request {
  user?: AccessTokenClaims;
}

/**
 * Authenticates OAuth2 client requests via a bearer access token whose audience is an existing
 * client (PC4): a token minted for a deleted client, or for no client, is refused.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly clientRepository: ClientRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccessTokenRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.tokenService.verifyAccessToken(
      header.slice(BEARER_PREFIX.length),
    );
    if (!claims || !(await this.clientRepository.findById(claims.aud))) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = claims;
    return true;
  }
}
