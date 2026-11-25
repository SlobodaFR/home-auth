import { NotFoundException } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { User } from '../../domain/user/user';
import {
  FakeFeatureFlags,
  FakeSessionService,
  FakeTelemetry,
  FakeTokenService,
  InMemoryClientRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { ResolveSessionUseCase } from './resolve-session.use-case';
import { RP_LOGOUT_FLAG, RpLogoutUseCase } from './rp-logout.use-case';

describe('RpLogoutUseCase', () => {
  async function setup(flag = true) {
    const clients = new InMemoryClientRepository();
    const users = new InMemoryUserRepository();
    const sessions = new FakeSessionService();
    const tokens = new FakeTokenService();
    const flags = new FakeFeatureFlags();
    const telemetry = new FakeTelemetry();
    flags.values.set(RP_LOGOUT_FLAG, flag);
    await clients.save(
      Client.create({
        id: 'budget',
        name: 'Budget',
        clientSecretHash: 'h',
        redirectUris: ['https://budget.sloboda.fr/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    await users.save(
      User.create({
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const useCase = new RpLogoutUseCase(
      clients,
      new ResolveSessionUseCase(sessions, users),
      tokens,
      flags,
      telemetry,
    );
    const validSession = await sessions.sign('u1', 0);
    const hintFor = (sub: string, aud = 'budget', ttl?: number) =>
      tokens.signAccessToken(
        { sub, email: 'a@b.c', name: 'A', isAdmin: false, aud },
        ttl,
      );
    const input = {
      clientId: 'budget',
      postLogoutRedirectUri: 'https://budget.sloboda.fr/bye',
      state: 'xyz',
    };
    return { useCase, flags, telemetry, validSession, hintFor, input, users };
  }

  const navigation = { isNavigation: true };

  describe('begin', () => {
    it('is a 404 when the flag is off', async () => {
      const { useCase, input, validSession } = await setup(false);
      await expect(
        useCase.begin({ ...input, sessionCookie: validSession, ...navigation }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is off by default in the code', async () => {
      const { useCase, flags, input } = await setup();
      flags.values.clear();
      await expect(
        useCase.begin({ ...input, sessionCookie: undefined, ...navigation }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(flags.asked).toContain(RP_LOGOUT_FLAG);
    });

    it('logs out immediately with a valid session, hint and navigation', async () => {
      const { useCase, input, validSession, hintFor, telemetry } =
        await setup();
      const result = await useCase.begin({
        ...input,
        sessionCookie: validSession,
        hint: await hintFor('u1'),
        ...navigation,
      });
      expect(result).toEqual({
        kind: 'redirect',
        redirectTo: 'https://budget.sloboda.fr/bye?state=xyz',
        clearCookie: true,
      });
      expect(telemetry.captured[0]).toEqual({
        event: {
          name: 'rp_logout',
          properties: { outcome: 'logged_out', client_id: 'budget' },
        },
        userId: 'u1',
      });
    });

    it('asks for confirmation without a hint', async () => {
      const { useCase, input, validSession, telemetry } = await setup();
      expect(
        await useCase.begin({
          ...input,
          sessionCookie: validSession,
          ...navigation,
        }),
      ).toEqual({ kind: 'confirm' });
      expect(telemetry.captured[0].event.properties).toEqual({
        outcome: 'confirm_required',
        client_id: 'budget',
      });
    });

    it.each([
      ['garbage', async () => 'garbage'],
      ['another client', (h: Hint) => h('u1', 'other')],
      ['another user', (h: Hint) => h('u2')],
      ['an expired token', (h: Hint) => h('u1', 'budget', -10)],
    ])('asks for confirmation with a hint that is %s', async (_l, make) => {
      const { useCase, input, validSession, hintFor } = await setup();
      expect(
        await useCase.begin({
          ...input,
          sessionCookie: validSession,
          hint: await make(hintFor),
          ...navigation,
        }),
      ).toEqual({ kind: 'confirm' });
    });

    it('asks for confirmation when the request is not a real navigation', async () => {
      const { useCase, input, validSession, hintFor } = await setup();
      expect(
        await useCase.begin({
          ...input,
          sessionCookie: validSession,
          hint: await hintFor('u1'),
          isNavigation: false,
        }),
      ).toEqual({ kind: 'confirm' });
    });

    it('redirects without revoking when there is no session (idempotent)', async () => {
      const { useCase, input, telemetry, hintFor } = await setup();
      for (const sessionCookie of [undefined, 'garbage']) {
        expect(
          await useCase.begin({
            ...input,
            sessionCookie,
            hint: await hintFor('u1'),
            ...navigation,
          }),
        ).toEqual({
          kind: 'redirect',
          redirectTo: 'https://budget.sloboda.fr/bye?state=xyz',
          clearCookie: true,
        });
      }
      expect(telemetry.captured[0].event.properties).toEqual({
        outcome: 'no_session',
        client_id: 'budget',
      });
      expect(telemetry.captured[0].userId).toBeUndefined();
    });

    it('treats a revoked session as no session', async () => {
      const { useCase, input, validSession, users } = await setup();
      await users.revokeSessions('u1');
      const result = await useCase.begin({
        ...input,
        sessionCookie: validSession,
        ...navigation,
      });
      expect(result.kind).toBe('redirect');
    });

    it('does not touch the user: other devices keep their session', async () => {
      const { useCase, input, validSession, hintFor, users } = await setup();
      await useCase.begin({
        ...input,
        sessionCookie: validSession,
        hint: await hintFor('u1'),
        ...navigation,
      });
      expect((await users.findById('u1'))?.sessionVersion).toBe(0);
    });

    it('omits state when none is given', async () => {
      const { useCase, input } = await setup();
      const result = await useCase.begin({
        clientId: input.clientId,
        postLogoutRedirectUri: input.postLogoutRedirectUri,
        sessionCookie: undefined,
        ...navigation,
      });
      expect(result).toMatchObject({
        redirectTo: 'https://budget.sloboda.fr/bye',
      });
    });

    it('reports an unknown client', async () => {
      const { useCase, input, validSession, telemetry } = await setup();
      expect(
        await useCase.begin({
          ...input,
          clientId: 'nope',
          sessionCookie: validSession,
          ...navigation,
        }),
      ).toEqual({ kind: 'invalid', reason: 'unknown_client' });
      expect(telemetry.captured[0].event.properties).toEqual({
        outcome: 'unknown_client',
      });
    });

    it.each([
      ['a malformed client id', { clientId: 'Bad Id!' }],
      ['a foreign redirect URI', { postLogoutRedirectUri: 'https://evil.fr/' }],
      ['an oversized state', { state: 'a'.repeat(513) }],
    ])(
      'rejects %s with invalid_request, nothing else happens',
      async (_l, o) => {
        const { useCase, input, validSession, telemetry } = await setup();
        expect(
          await useCase.begin({
            ...input,
            ...o,
            sessionCookie: validSession,
            ...navigation,
          }),
        ).toEqual({ kind: 'invalid', reason: 'invalid_request' });
        expect(telemetry.captured[0].event.properties).toEqual({
          outcome: 'invalid_request',
        });
      },
    );
  });

  describe('confirm', () => {
    it('is a 404 when the flag is off', async () => {
      const { useCase, input, validSession } = await setup(false);
      await expect(
        useCase.confirm({ ...input, sessionCookie: validSession }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the redirect for a valid session', async () => {
      const { useCase, input, validSession, telemetry } = await setup();
      expect(
        await useCase.confirm({ ...input, sessionCookie: validSession }),
      ).toEqual({
        kind: 'redirect',
        redirectTo: 'https://budget.sloboda.fr/bye?state=xyz',
        clearCookie: true,
      });
      expect(telemetry.captured[0].event.properties).toEqual({
        outcome: 'logged_out',
        client_id: 'budget',
      });
    });

    it('returns the redirect without a session too', async () => {
      const { useCase, input, telemetry } = await setup();
      expect(
        await useCase.confirm({ ...input, sessionCookie: undefined }),
      ).toMatchObject({ kind: 'redirect' });
      expect(telemetry.captured[0].event.properties).toEqual({
        outcome: 'no_session',
        client_id: 'budget',
      });
    });

    it('rejects invalid input without effect', async () => {
      const { useCase, input, validSession } = await setup();
      expect(
        await useCase.confirm({
          ...input,
          postLogoutRedirectUri: 'https://evil.fr/',
          sessionCookie: validSession,
        }),
      ).toEqual({ kind: 'invalid', reason: 'invalid_request' });
      expect(
        await useCase.confirm({
          ...input,
          clientId: 'nope',
          sessionCookie: validSession,
        }),
      ).toEqual({ kind: 'invalid', reason: 'unknown_client' });
    });
  });
});

type Hint = (sub: string, aud?: string, ttl?: number) => Promise<string>;
