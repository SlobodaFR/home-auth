import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ResolveSessionUseCase } from '../../../application/auth/resolve-session.use-case';
import { User } from '../../../domain/user/user';
import { sessionCookieName } from '../session-cookie';
import { SessionAuthGuard } from './session-auth.guard';

const alice = User.create({
  id: 'u1',
  email: 'alice@example.com',
  name: 'Alice',
  avatarKey: null,
  isAdmin: true,
  createdAt: new Date(),
});

function context(cookies: Record<string, string>) {
  const request: { cookies: Record<string, string>; user?: unknown } = {
    cookies,
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('SessionAuthGuard', () => {
  function guardWith(user: User | null) {
    const execute = vi.fn<(token: string | undefined) => Promise<User | null>>(
      () => Promise.resolve(user),
    );
    const guard = new SessionAuthGuard({
      execute,
    } as unknown as ResolveSessionUseCase);
    return { guard, execute };
  }

  it('attaches the resolved user to the request', async () => {
    const { guard, execute } = guardWith(alice);
    const { ctx, request } = context({ [sessionCookieName()]: 'jwt' });

    expect(await guard.canActivate(ctx)).toBe(true);

    expect(execute).toHaveBeenCalledWith('jwt');
    expect(request.user).toEqual({
      id: 'u1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: true,
    });
  });

  it('rejects a request the session cannot be resolved for (missing, invalid, revoked)', async () => {
    const { guard } = guardWith(null);

    await expect(
      guard.canActivate(context({ [sessionCookieName()]: 'jwt' }).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(context({}).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('reads __Host-auth_session in production and ignores the plain name', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { guard, execute } = guardWith(alice);

    await guard.canActivate(context({ '__Host-auth_session': 'jwt' }).ctx);
    expect(execute).toHaveBeenCalledWith('jwt');

    execute.mockClear();
    execute.mockResolvedValue(null);
    await expect(
      guard.canActivate(context({ auth_session: 'jwt' }).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(execute).toHaveBeenCalledWith(undefined);
    vi.unstubAllEnvs();
  });
});
