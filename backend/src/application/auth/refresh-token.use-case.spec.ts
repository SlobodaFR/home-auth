import { randomUUID } from 'crypto';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { Client } from '../../domain/client/client';
import * as hash from '../../domain/shared/hash';
import { hashSecret, hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import {
  FakeFeatureFlags,
  FakeTelemetry,
  FakeTokenService,
  InMemoryClientRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { RefreshTokenUseCase } from './refresh-token.use-case';

const RAW_SECRET = 's3cret';
const RAW_REFRESH_TOKEN = 'raw-refresh-token';
const FAMILY_ID = 'family-1';

describe('RefreshTokenUseCase', () => {
  function createUseCase() {
    const clientRepository = new InMemoryClientRepository();
    const refreshTokenRepository = new InMemoryRefreshTokenRepository();
    const userRepository = new InMemoryUserRepository();
    const tokenService = new FakeTokenService();
    const telemetry = new FakeTelemetry();
    const featureFlags = new FakeFeatureFlags();
    const useCase = new RefreshTokenUseCase(
      clientRepository,
      refreshTokenRepository,
      userRepository,
      tokenService,
      telemetry,
      featureFlags,
    );
    return {
      useCase,
      telemetry,
      featureFlags,
      clientRepository,
      refreshTokenRepository,
      userRepository,
    };
  }

  async function seed(
    deps: ReturnType<typeof createUseCase>,
    expiresAt?: Date,
  ) {
    await deps.clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: await hashSecret(RAW_SECRET),
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    await deps.userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
    const token = expiresAt
      ? RefreshToken.fromPersistence({
          id: randomUUID(),
          tokenHash: hashToken(RAW_REFRESH_TOKEN),
          userId: 'user-1',
          clientId: 'budget',
          createdAt: new Date(),
          expiresAt,
          familyId: FAMILY_ID,
          rotatedAt: null,
          graceUsedAt: null,
        })
      : RefreshToken.issue({
          id: randomUUID(),
          tokenHash: hashToken(RAW_REFRESH_TOKEN),
          userId: 'user-1',
          clientId: 'budget',
          createdAt: new Date(),
          familyId: FAMILY_ID,
        });
    await deps.refreshTokenRepository.save(token);
  }

  it('reports the exchange with the client and grant type', async () => {
    const deps = createUseCase();
    await seed(deps);

    await deps.useCase.execute({
      refreshToken: RAW_REFRESH_TOKEN,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
    });

    expect(deps.telemetry.captured).toEqual([
      {
        event: {
          name: 'token_exchanged',
          properties: { client_id: 'budget', grant_type: 'refresh_token' },
        },
        userId: 'user-1',
      },
    ]);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const deps = createUseCase();
    await seed(deps);

    const result = await deps.useCase.execute({
      refreshToken: RAW_REFRESH_TOKEN,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
    });

    expect(result.refreshToken).not.toBe(RAW_REFRESH_TOKEN);
    // Kept, marked rotated: a later presentation is recognised as a reuse (PC1).
    expect(
      (
        await deps.refreshTokenRepository.findByTokenHash(
          hashToken(RAW_REFRESH_TOKEN),
        )
      )?.rotatedAt,
    ).toBeInstanceOf(Date);
    expect(
      await deps.refreshTokenRepository.findByTokenHash(
        hashToken(result.refreshToken),
      ),
    ).not.toBeNull();
    const claims = JSON.parse(result.accessToken) as { isAdmin: boolean };
    expect(claims.isAdmin).toBe(false);
  });

  it('keeps the new refresh token in the family of the one it replaces', async () => {
    const deps = createUseCase();
    await seed(deps);

    const result = await deps.useCase.execute({
      refreshToken: RAW_REFRESH_TOKEN,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
    });

    const rotated = await deps.refreshTokenRepository.findByTokenHash(
      hashToken(result.refreshToken),
    );
    expect(rotated?.familyId).toBe(FAMILY_ID);
  });

  it('rejects an invalid client secret', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({
        refreshToken: RAW_REFRESH_TOKEN,
        clientId: 'budget',
        clientSecret: 'wrong',
      }),
    ).rejects.toThrow('Invalid client credentials');
  });

  it('rejects an unknown refresh token', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({
        refreshToken: 'unknown',
        clientId: 'budget',
        clientSecret: RAW_SECRET,
      }),
    ).rejects.toThrow('Invalid refresh token');
  });

  it('rejects and deletes an expired refresh token', async () => {
    const deps = createUseCase();
    await seed(deps, new Date(Date.now() - 1000));

    await expect(
      deps.useCase.execute({
        refreshToken: RAW_REFRESH_TOKEN,
        clientId: 'budget',
        clientSecret: RAW_SECRET,
      }),
    ).rejects.toThrow('Refresh token expired');
    expect(
      await deps.refreshTokenRepository.findByTokenHash(
        hashToken(RAW_REFRESH_TOKEN),
      ),
    ).toBeNull();
  });
  // Same cost as a known client: response time must not reveal which client ids exist.
  it('runs the secret check even when the client is unknown', async () => {
    const deps = createUseCase();
    const verify = vi.spyOn(hash, 'verifySecret');

    await expect(
      deps.useCase.execute({
        refreshToken: RAW_REFRESH_TOKEN,
        clientId: 'unknown',
        clientSecret: RAW_SECRET,
      }),
    ).rejects.toThrow('Invalid client credentials');
    expect(verify).toHaveBeenCalledWith(RAW_SECRET, null);
    verify.mockRestore();
  });

  describe('reuse of a rotated refresh token (PC1)', () => {
    const SECOND = 1000;
    const input = {
      refreshToken: RAW_REFRESH_TOKEN,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
    };

    async function seedRotated(
      deps: ReturnType<typeof createUseCase>,
      rotatedAgoMs: number,
    ) {
      await seed(deps);
      const token = await deps.refreshTokenRepository.findByTokenHash(
        hashToken(RAW_REFRESH_TOKEN),
      );
      await deps.refreshTokenRepository.markRotated(
        token!.id,
        new Date(Date.now() - rotatedAgoMs),
      );
      // The token that replaced it, still current.
      await deps.refreshTokenRepository.save(
        RefreshToken.issue({
          id: randomUUID(),
          tokenHash: hashToken('current'),
          userId: 'user-1',
          clientId: 'budget',
          createdAt: new Date(),
          familyId: FAMILY_ID,
        }),
      );
    }

    function reuseEvents(deps: ReturnType<typeof createUseCase>) {
      return deps.telemetry.captured
        .map(({ event }) => event)
        .filter((event) => event.name === 'refresh_reused');
    }

    it('issues a new pair in the same family within the 30 s grace window', async () => {
      const deps = createUseCase();
      await seedRotated(deps, 10 * SECOND);

      const result = await deps.useCase.execute(input);

      const issued = await deps.refreshTokenRepository.findByTokenHash(
        hashToken(result.refreshToken),
      );
      expect(issued?.familyId).toBe(FAMILY_ID);
      expect(issued?.rotatedAt).toBeNull();
      expect(
        (
          await deps.refreshTokenRepository.findByTokenHash(
            hashToken(RAW_REFRESH_TOKEN),
          )
        )?.rotatedAt,
      ).toBeInstanceOf(Date);
      expect(reuseEvents(deps)).toEqual([
        {
          name: 'refresh_reused',
          properties: {
            client_id: 'budget',
            kind: 'rotated_in_grace',
            revoked: false,
          },
        },
      ]);
      expect(deps.featureFlags.asked).toEqual([]);
    });

    it('treats a lost concurrent rotation as the grace case', async () => {
      const deps = createUseCase();
      await seed(deps);
      const repository = deps.refreshTokenRepository;
      const markRotated: RefreshTokenRepository['markRotated'] =
        repository.markRotated.bind(repository);
      // Another request rotates the token between our read and our update.
      vi.spyOn(repository, 'markRotated').mockImplementation(
        async (id: string, at: Date) => {
          await markRotated(id, at);
          return false;
        },
      );

      const result = await deps.useCase.execute(input);

      expect(
        (await repository.findByTokenHash(hashToken(result.refreshToken)))
          ?.familyId,
      ).toBe(FAMILY_ID);
      expect(reuseEvents(deps)).toEqual([
        {
          name: 'refresh_reused',
          properties: {
            client_id: 'budget',
            kind: 'concurrent_lost_race',
            revoked: false,
          },
        },
      ]);
    });

    it('refuses a token deleted between its read and its rotation (logout, family revoked)', async () => {
      const deps = createUseCase();
      await seed(deps);
      const repository = deps.refreshTokenRepository;
      vi.spyOn(repository, 'markRotated').mockImplementation(async () => {
        await repository.deleteFamily(FAMILY_ID);
        return false;
      });

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(await repository.findAllForUser('user-1')).toEqual([]);
      expect(reuseEvents(deps)).toEqual([]);
    });

    it('still gives a new pair exactly 30 s after the rotation', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
      try {
        const deps = createUseCase();
        await seedRotated(deps, 30 * SECOND);

        await expect(deps.useCase.execute(input)).resolves.toBeDefined();
        expect(reuseEvents(deps)[0]?.properties).toMatchObject({
          kind: 'rotated_in_grace',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('gives every one of concurrent refreshes a valid pair', async () => {
      const deps = createUseCase();
      await seed(deps);

      const results = await Promise.all([
        deps.useCase.execute(input),
        deps.useCase.execute(input),
      ]);

      for (const result of results) {
        expect(
          (
            await deps.refreshTokenRepository.findByTokenHash(
              hashToken(result.refreshToken),
            )
          )?.rotatedAt,
        ).toBeNull();
      }
      // Exactly one request rotated it; the other one was served as a reuse within the grace
      // window (before or after its own read, depending on the interleaving).
      const kinds = reuseEvents(deps).map((event) =>
        event.name === 'refresh_reused' ? event.properties.kind : null,
      );
      expect(kinds).toHaveLength(1);
      expect(['rotated_in_grace', 'concurrent_lost_race']).toContain(kinds[0]);
    });

    it('refuses it after the grace window, keeping the family while the flag is off', async () => {
      const deps = createUseCase();
      await seedRotated(deps, 31 * SECOND);

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(deps.featureFlags.asked).toEqual([
        'auth-refresh-reuse-revocation',
      ]);
      expect(
        await deps.refreshTokenRepository.findByTokenHash(hashToken('current')),
      ).not.toBeNull();
      expect(reuseEvents(deps)).toEqual([
        {
          name: 'refresh_reused',
          properties: {
            client_id: 'budget',
            kind: 'rotated_after_grace',
            revoked: false,
          },
        },
      ]);
    });

    it('revokes the whole family after the grace window when the flag is on', async () => {
      const deps = createUseCase();
      await seedRotated(deps, 31 * SECOND);
      deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(
        await deps.refreshTokenRepository.findByTokenHash(hashToken('current')),
      ).toBeNull();
      expect(
        await deps.refreshTokenRepository.findByTokenHash(
          hashToken(RAW_REFRESH_TOKEN),
        ),
      ).toBeNull();
      expect(reuseEvents(deps)).toEqual([
        {
          name: 'refresh_reused',
          properties: {
            client_id: 'budget',
            kind: 'rotated_after_grace',
            revoked: true,
          },
        },
      ]);
    });

    describe('a single re-issue per rotated token (PC1 amended)', () => {
      const presented = (deps: ReturnType<typeof createUseCase>) =>
        deps.refreshTokenRepository.findByTokenHash(
          hashToken(RAW_REFRESH_TOKEN),
        );

      it('spends the grace of the presented token on its re-issue', async () => {
        const deps = createUseCase();
        await seedRotated(deps, 10 * SECOND);

        await deps.useCase.execute(input);

        expect((await presented(deps))?.graceUsedAt).toBeInstanceOf(Date);
      });

      it('refuses a second presentation in the window, keeping the family while the flag is off', async () => {
        const deps = createUseCase();
        await seedRotated(deps, 10 * SECOND);
        const first = await deps.useCase.execute(input);

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(
          await deps.refreshTokenRepository.findByTokenHash(
            hashToken(first.refreshToken),
          ),
        ).not.toBeNull();
        expect(
          await deps.refreshTokenRepository.findByTokenHash(
            hashToken('current'),
          ),
        ).not.toBeNull();
        expect(reuseEvents(deps)).toEqual([
          {
            name: 'refresh_reused',
            properties: {
              client_id: 'budget',
              kind: 'rotated_in_grace',
              revoked: false,
            },
          },
          {
            name: 'refresh_reused',
            properties: {
              client_id: 'budget',
              kind: 'grace_exhausted',
              revoked: false,
            },
          },
        ]);
      });

      it('revokes the whole family on a second presentation in the window when the flag is on', async () => {
        const deps = createUseCase();
        await seedRotated(deps, 10 * SECOND);
        deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);
        const first = await deps.useCase.execute(input);

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(
          await deps.refreshTokenRepository.findAllForUser('user-1'),
        ).toEqual([]);
        expect(
          await deps.refreshTokenRepository.findByTokenHash(
            hashToken(first.refreshToken),
          ),
        ).toBeNull();
        expect(reuseEvents(deps).at(-1)).toEqual({
          name: 'refresh_reused',
          properties: {
            client_id: 'budget',
            kind: 'grace_exhausted',
            revoked: true,
          },
        });
      });

      it('lets a lost concurrent rotation spend the grace too', async () => {
        const deps = createUseCase();
        await seed(deps);
        const repository = deps.refreshTokenRepository;
        const markRotated: RefreshTokenRepository['markRotated'] =
          repository.markRotated.bind(repository);
        const spy = vi
          .spyOn(repository, 'markRotated')
          .mockImplementationOnce(async (id: string, at: Date) => {
            await markRotated(id, at);
            return false;
          });

        await deps.useCase.execute(input);
        spy.mockRestore();

        expect((await presented(deps))?.graceUsedAt).toBeInstanceOf(Date);
        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );
        expect(reuseEvents(deps).map((event) => event.properties)).toEqual([
          { client_id: 'budget', kind: 'concurrent_lost_race', revoked: false },
          { client_id: 'budget', kind: 'grace_exhausted', revoked: false },
        ]);
      });

      it('gives exactly two of three concurrent refreshes a pair', async () => {
        const deps = createUseCase();
        await seed(deps);

        const results = await Promise.allSettled([
          deps.useCase.execute(input),
          deps.useCase.execute(input),
          deps.useCase.execute(input),
        ]);

        expect(
          results.filter(({ status }) => status === 'fulfilled'),
        ).toHaveLength(2);
        expect(
          reuseEvents(deps).filter(
            (event) => event.properties.kind === 'grace_exhausted',
          ),
        ).toHaveLength(1);
      });

      it('refuses a token deleted before it could spend its grace, as an unknown token', async () => {
        const deps = createUseCase();
        await seedRotated(deps, 10 * SECOND);
        deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);
        const repository = deps.refreshTokenRepository;
        // A logout or a revoked family between our read and our claim.
        vi.spyOn(repository, 'claimGrace').mockImplementation(async () => {
          await repository.deleteFamily(FAMILY_ID);
          return false;
        });

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(reuseEvents(deps)).toEqual([]);
        expect(deps.featureFlags.asked).toEqual([]);
      });

      it('takes back its new token when the family is revoked before the re-check', async () => {
        const deps = createUseCase();
        await seedRotated(deps, 10 * SECOND);
        const repository = deps.refreshTokenRepository;
        const save: RefreshTokenRepository['save'] =
          repository.save.bind(repository);
        // A concurrent reuse revokes the family while our new token is being inserted.
        vi.spyOn(repository, 'save').mockImplementation(async (token) => {
          await repository.deleteFamily(FAMILY_ID);
          await save(token);
        });

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(await repository.findAllForUser('user-1')).toEqual([]);
        expect(deps.telemetry.names()).not.toContain('token_exchanged');
        expect(reuseEvents(deps)).toEqual([]);
      });

      it('takes back the new token of a normal rotation when the family is revoked meanwhile', async () => {
        const deps = createUseCase();
        await seed(deps);
        const repository = deps.refreshTokenRepository;
        const save: RefreshTokenRepository['save'] =
          repository.save.bind(repository);
        // A reuse after grace (flag on) revokes the family before our insert.
        vi.spyOn(repository, 'save').mockImplementation(async (token) => {
          await repository.deleteFamily(FAMILY_ID);
          await save(token);
        });

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(await repository.findAllForUser('user-1')).toEqual([]);
        expect(deps.telemetry.names()).not.toContain('token_exchanged');
      });
    });

    describe('a token both rotated and expired', () => {
      async function seedRotatedExpired(
        deps: ReturnType<typeof createUseCase>,
        rotatedAgoMs: number,
      ) {
        await seed(deps, new Date(Date.now() - SECOND));
        const token = await deps.refreshTokenRepository.findByTokenHash(
          hashToken(RAW_REFRESH_TOKEN),
        );
        await deps.refreshTokenRepository.markRotated(
          token!.id,
          new Date(Date.now() - rotatedAgoMs),
        );
        await deps.refreshTokenRepository.save(
          RefreshToken.issue({
            id: randomUUID(),
            tokenHash: hashToken('current'),
            userId: 'user-1',
            clientId: 'budget',
            createdAt: new Date(),
            familyId: FAMILY_ID,
          }),
        );
      }

      it('goes through reuse detection, keeping the family while the flag is off', async () => {
        const deps = createUseCase();
        await seedRotatedExpired(deps, 31 * SECOND);

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(
          await deps.refreshTokenRepository.findByTokenHash(
            hashToken('current'),
          ),
        ).not.toBeNull();
        expect(reuseEvents(deps)).toEqual([
          {
            name: 'refresh_reused',
            properties: {
              client_id: 'budget',
              kind: 'rotated_after_grace',
              revoked: false,
            },
          },
        ]);
      });

      it('revokes the family when the flag is on', async () => {
        const deps = createUseCase();
        await seedRotatedExpired(deps, 31 * SECOND);
        deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(
          await deps.refreshTokenRepository.findAllForUser('user-1'),
        ).toEqual([]);
        expect(reuseEvents(deps)[0]?.properties).toMatchObject({
          kind: 'rotated_after_grace',
          revoked: true,
        });
      });

      // Expiry wins over the window: an expired token never gets a pair.
      it('gets no pair even inside the 30 s window', async () => {
        const deps = createUseCase();
        await seedRotatedExpired(deps, 10 * SECOND);

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(reuseEvents(deps)[0]?.properties).toMatchObject({
          kind: 'rotated_after_grace',
        });
        expect((await presented(deps))?.graceUsedAt).toBeNull();
      });

      const presented = (deps: ReturnType<typeof createUseCase>) =>
        deps.refreshTokenRepository.findByTokenHash(
          hashToken(RAW_REFRESH_TOKEN),
        );
    });

    it('never asks the flag on a normal rotation', async () => {
      const deps = createUseCase();
      await seed(deps);

      await deps.useCase.execute(input);

      expect(deps.featureFlags.asked).toEqual([]);
      expect(reuseEvents(deps)).toEqual([]);
    });
  });
});
