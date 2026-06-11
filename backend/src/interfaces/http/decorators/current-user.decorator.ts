import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionRequest, SessionUser } from '../guards/session-auth.guard';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const user = ctx.switchToHttp().getRequest<SessionRequest>().user;
  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }
  return user;
});
