import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ResolveSessionUseCase } from '../../../application/auth/resolve-session.use-case';

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
  constructor(private readonly resolveSession: ResolveSessionUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const user = await this.resolveSession.execute(
      request.cookies[SESSION_COOKIE_NAME],
    );
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
    };
    return true;
  }
}
