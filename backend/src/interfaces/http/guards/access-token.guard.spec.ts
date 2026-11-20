import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  FakeTokenService,
  InMemoryClientRepository,
} from '../../../application/test/in-memory-repositories';
import { Client } from '../../../domain/client/client';
import { AccessTokenGuard, AccessTokenRequest } from './access-token.guard';

function contextFor(request: Partial<AccessTokenRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccessTokenGuard (/userinfo, /me)', () => {
  const tokens = new FakeTokenService();
  let clients: InMemoryClientRepository;
  let guard: AccessTokenGuard;

  async function bearer(aud: string): Promise<Partial<AccessTokenRequest>> {
    const token = await tokens.signAccessToken({
      sub: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: false,
      aud,
    });
    return { headers: { authorization: `Bearer ${token}` } };
  }

  beforeEach(async () => {
    clients = new InMemoryClientRepository();
    await clients.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: ['https://budget.example.com/cb'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    guard = new AccessTokenGuard(tokens, clients);
  });

  it('accepts a token whose audience is an existing client', async () => {
    const request = await bearer('budget');

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user?.sub).toBe('user-1');
  });

  it('rejects a token whose audience is no client (PC4)', async () => {
    const request = await bearer('not-a-client');

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('rejects a token of a deleted client', async () => {
    const request = await bearer('budget');
    await clients.delete('budget');

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request without bearer token', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
