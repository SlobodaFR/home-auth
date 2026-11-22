import { AuthorizationCode } from '../../domain/auth/authorization-code';
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
  InMemoryAuthorizationCodeRepository,
  InMemoryClientRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { ExchangeCodeUseCase } from './exchange-code.use-case';

const REDIRECT_URI = 'https://budget.example.com/auth/callback';
const RAW_SECRET = 's3cret';
const RAW_CODE = 'raw-code';

describe('ExchangeCodeUseCase', () => {
  function createUseCase() {
    const clientRepository = new InMemoryClientRepository();
    const authorizationCodeRepository =
      new InMemoryAuthorizationCodeRepository();
    const refreshTokenRepository = new InMemoryRefreshTokenRepository();
    const userRepository = new InMemoryUserRepository();
    const tokenService = new FakeTokenService();
    const telemetry = new FakeTelemetry();
    const featureFlags = new FakeFeatureFlags();
    const useCase = new ExchangeCodeUseCase(
      clientRepository,
      authorizationCodeRepository,
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
      authorizationCodeRepository,
      refreshTokenRepository,
      userRepository,
    };
  }

  async function seed(
    deps: ReturnType<typeof createUseCase>,
    codeChallenge: string | null = null,
  ) {
    await deps.clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: await hashSecret(RAW_SECRET),
        redirectUris: [REDIRECT_URI],
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
    await deps.authorizationCodeRepository.save(
      AuthorizationCode.issue({
        codeHash: hashToken(RAW_CODE),
        userId: 'user-1',
        clientId: 'budget',
        redirectUri: REDIRECT_URI,
        codeChallenge,
      }),
    );
  }

  it('reports the exchange with the client and grant type', async () => {
    const deps = createUseCase();
    await seed(deps);

    await deps.useCase.execute({
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    });

    expect(deps.telemetry.captured).toEqual([
      {
        event: {
          name: 'token_exchanged',
          properties: { client_id: 'budget', grant_type: 'authorization_code' },
        },
        userId: 'user-1',
      },
    ]);
  });

  it('exchanges a valid code for an access and refresh token', async () => {
    const deps = createUseCase();
    await seed(deps);

    const result = await deps.useCase.execute({
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    });

    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(15 * 60);
    const claims = JSON.parse(result.accessToken) as {
      sub: string;
      aud: string;
      isAdmin: boolean;
    };
    expect(claims.sub).toBe('user-1');
    expect(claims.aud).toBe('budget');
    expect(claims.isAdmin).toBe(false);

    const stored = await deps.refreshTokenRepository.findByTokenHash(
      hashToken(result.refreshToken),
    );
    expect(stored?.userId).toBe('user-1');
  });

  it('starts a refresh token family named after the code hash', async () => {
    const deps = createUseCase();
    await seed(deps);

    const result = await deps.useCase.execute({
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    });

    const stored = await deps.refreshTokenRepository.findByTokenHash(
      hashToken(result.refreshToken),
    );
    expect(stored?.familyId).toBe(hashToken(RAW_CODE));
  });

  it('rejects an invalid client secret', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({
        code: RAW_CODE,
        clientId: 'budget',
        clientSecret: 'wrong',
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow('Invalid client credentials');
  });

  it('rejects a code already redeemed', async () => {
    const deps = createUseCase();
    await seed(deps);
    await deps.useCase.execute({
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    });

    await expect(
      deps.useCase.execute({
        code: RAW_CODE,
        clientId: 'budget',
        clientSecret: RAW_SECRET,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow('Authorization code already used');
  });

  describe('reuse of a code (PC2)', () => {
    const input = {
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    };

    it('reports it and keeps the tokens it issued while the flag is off', async () => {
      const deps = createUseCase();
      await seed(deps);
      const first = await deps.useCase.execute(input);

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Authorization code already used',
      );

      expect(
        await deps.refreshTokenRepository.findByTokenHash(
          hashToken(first.refreshToken),
        ),
      ).not.toBeNull();
      expect(deps.featureFlags.asked).toEqual([
        'auth-refresh-reuse-revocation',
      ]);
      expect(
        deps.telemetry.captured.filter(
          ({ event }) => event.name === 'code_reused',
        ),
      ).toEqual([
        {
          event: { name: 'code_reused', properties: { client_id: 'budget' } },
          userId: 'user-1',
        },
      ]);
    });

    it('revokes the refresh tokens descending from the code when the flag is on', async () => {
      const deps = createUseCase();
      await seed(deps);
      deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);
      const first = await deps.useCase.execute(input);

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Authorization code already used',
      );

      expect(
        await deps.refreshTokenRepository.findByTokenHash(
          hashToken(first.refreshToken),
        ),
      ).toBeNull();
    });

    it('treats a lost concurrent redemption as a reuse', async () => {
      const deps = createUseCase();
      await seed(deps);
      vi.spyOn(
        deps.authorizationCodeRepository,
        'markRedeemed',
      ).mockResolvedValue(false);

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Authorization code already used',
      );

      expect(deps.telemetry.names()).toEqual(['code_reused']);
    });

    const storedCode = (deps: ReturnType<typeof createUseCase>) =>
      deps.authorizationCodeRepository.findByCodeHash(hashToken(RAW_CODE));

    it('leaves a durable reuse marker on the code, whatever the flag', async () => {
      const deps = createUseCase();
      await seed(deps);
      await deps.useCase.execute(input);
      expect((await storedCode(deps))?.reusedAt).toBeNull();

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Authorization code already used',
      );

      expect((await storedCode(deps))?.reusedAt).toBeInstanceOf(Date);
    });

    it('marks the code when it loses a concurrent redemption', async () => {
      const deps = createUseCase();
      await seed(deps);
      vi.spyOn(
        deps.authorizationCodeRepository,
        'markRedeemed',
      ).mockResolvedValue(false);

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Authorization code already used',
      );

      expect((await storedCode(deps))?.reusedAt).toBeInstanceOf(Date);
    });

    it('revokes every token descending from a code redeemed again later (flag on)', async () => {
      const deps = createUseCase();
      await seed(deps);
      deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);
      await deps.useCase.execute(input);
      // The family has rotated since: the descendants keep the code hash as family id.
      await deps.refreshTokenRepository.save(
        RefreshToken.issue({
          id: 'descendant',
          tokenHash: 'descendant-hash',
          userId: 'user-1',
          clientId: 'budget',
          createdAt: new Date(),
          familyId: hashToken(RAW_CODE),
        }),
      );

      await expect(deps.useCase.execute(input)).rejects.toThrow(
        'Authorization code already used',
      );

      expect(
        await deps.refreshTokenRepository.findAllForUser('user-1'),
      ).toEqual([]);
    });

    describe('when the reuse is detected while the winner is saving its token', () => {
      // The losing request marks the code and revokes the family before the winner inserted its
      // refresh token: the winner must see the marker after its insert.
      function reuseDuringSave(deps: ReturnType<typeof createUseCase>) {
        const repository = deps.refreshTokenRepository;
        const save: RefreshTokenRepository['save'] =
          repository.save.bind(repository);
        vi.spyOn(repository, 'save').mockImplementation(async (token) => {
          await deps.authorizationCodeRepository.markReused(
            hashToken(RAW_CODE),
            new Date(),
          );
          await repository.deleteFamily(hashToken(RAW_CODE));
          await save(token);
        });
      }

      it('refuses the winner and takes back its token when the flag is on', async () => {
        const deps = createUseCase();
        await seed(deps);
        deps.featureFlags.values.set('auth-refresh-reuse-revocation', true);
        reuseDuringSave(deps);

        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Authorization code already used',
        );

        expect(
          await deps.refreshTokenRepository.findAllForUser('user-1'),
        ).toEqual([]);
        expect(deps.telemetry.names()).toEqual([]);
      });

      it('lets the winner through while the flag is off', async () => {
        const deps = createUseCase();
        await seed(deps);
        reuseDuringSave(deps);

        const result = await deps.useCase.execute(input);

        expect(
          await deps.refreshTokenRepository.findByTokenHash(
            hashToken(result.refreshToken),
          ),
        ).not.toBeNull();
        expect(deps.telemetry.names()).toEqual(['token_exchanged']);
      });
    });

    it('does not read the flag on a redemption nobody reused', async () => {
      const deps = createUseCase();
      await seed(deps);

      await deps.useCase.execute(input);

      expect(deps.featureFlags.asked).toEqual([]);
    });

    it('does not treat an expired, unused code as a reuse', async () => {
      const deps = createUseCase();
      await seed(deps);
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);

      try {
        await expect(deps.useCase.execute(input)).rejects.toThrow(
          'Authorization code expired',
        );
      } finally {
        vi.useRealTimers();
      }
      expect(deps.featureFlags.asked).toEqual([]);
      expect(deps.telemetry.names()).toEqual([]);
    });
  });

  it('rejects a redirect_uri mismatch', async () => {
    const deps = createUseCase();
    await seed(deps);

    await expect(
      deps.useCase.execute({
        code: RAW_CODE,
        clientId: 'budget',
        clientSecret: RAW_SECRET,
        redirectUri: 'https://other.example.com',
      }),
    ).rejects.toThrow('Invalid authorization code');
  });
  // Same cost as a known client: response time must not reveal which client ids exist.
  it('runs the secret check even when the client is unknown', async () => {
    const deps = createUseCase();
    const verify = vi.spyOn(hash, 'verifySecret');

    await expect(
      deps.useCase.execute({
        code: RAW_CODE,
        clientId: 'unknown',
        clientSecret: RAW_SECRET,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow('Invalid client credentials');
    expect(verify).toHaveBeenCalledWith(RAW_SECRET, null);
    verify.mockRestore();
  });

  // Two concurrent exchanges of the same code: exactly one gets tokens (#20).
  it('redeems a code only once under concurrent requests', async () => {
    const deps = createUseCase();
    await seed(deps);
    const input = {
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: RAW_SECRET,
      redirectUri: REDIRECT_URI,
    };

    const results = await Promise.allSettled([
      deps.useCase.execute(input),
      deps.useCase.execute(input),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(String(rejected?.reason)).toContain(
      'Authorization code already used',
    );
  });

  describe('PKCE (#15)', () => {
    const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const exchange = (
      deps: ReturnType<typeof createUseCase>,
      codeVerifier?: string,
    ) =>
      deps.useCase.execute({
        code: RAW_CODE,
        clientId: 'budget',
        clientSecret: RAW_SECRET,
        redirectUri: REDIRECT_URI,
        codeVerifier,
      });

    it('exchanges a code with the matching verifier', async () => {
      const deps = createUseCase();
      await seed(deps, CHALLENGE);

      await expect(exchange(deps, VERIFIER)).resolves.toMatchObject({
        tokenType: 'Bearer',
      });
    });

    it.each([
      ['a missing verifier', undefined],
      ['a wrong verifier', `${VERIFIER.slice(0, -1)}x`],
    ])('refuses %s without burning the code', async (_label, verifier) => {
      const deps = createUseCase();
      await seed(deps, CHALLENGE);

      await expect(exchange(deps, verifier)).rejects.toThrow(
        'Invalid authorization code',
      );
      expect(
        (
          await deps.authorizationCodeRepository.findByCodeHash(
            hashToken(RAW_CODE),
          )
        )?.used,
      ).toBe(false);
      await expect(exchange(deps, VERIFIER)).resolves.toMatchObject({
        tokenType: 'Bearer',
      });
    });

    it('refuses a verifier for a code issued without challenge (downgrade)', async () => {
      const deps = createUseCase();
      await seed(deps);

      await expect(exchange(deps, VERIFIER)).rejects.toThrow(
        'Invalid authorization code',
      );
      expect(
        (
          await deps.authorizationCodeRepository.findByCodeHash(
            hashToken(RAW_CODE),
          )
        )?.used,
      ).toBe(false);
    });

    it('keeps clients without PKCE working', async () => {
      const deps = createUseCase();
      await seed(deps);

      await expect(exchange(deps)).resolves.toMatchObject({
        tokenType: 'Bearer',
      });
    });
  });
});
