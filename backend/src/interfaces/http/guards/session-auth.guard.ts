import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from '../../../domain/auth/session.service';
import { UserRepository } from '../../../domain/user/user.repository';

export const SESSION_COOKIE_NAME = 'auth_session';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface SessionRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: SessionUser;
}

/** Authenticates the auth-service's own UI via the SSO session cookie. */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const userId = await this.sessionService.verify(token);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }

    request.user = { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
    return true;
  }
}
