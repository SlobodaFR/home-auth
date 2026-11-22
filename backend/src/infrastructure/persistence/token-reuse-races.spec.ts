import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeCodeUseCase } from '../../application/auth/exchange-code.use-case';
import { RefreshTokenUseCase } from '../../application/auth/refresh-token.use-case';
import {
  FakeFeatureFlags,
  FakeTelemetry,
  FakeTokenService,
} from '../../application/test/in-memory-repositories';
import { AuthorizationCode } from '../../domain/auth/authorization-code';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { Client } from '../../domain/client/client';
import { hashSecret, hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { TypeOrmAuthorizationCodeRepository } from './repositories/typeorm-authorization-code.repository';
import { TypeOrmClientRepository } from './repositories/typeorm-client.repository';
import { TypeOrmRefreshTokenRepository } from './repositories/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';

/**
 * Reuse races (PC1, PC2) against the real SQLite repositories. The dangerous interleaving (a reuse
 * revokes the family between a winner's atomic UPDATE and its INSERT) is forced with a gate on
 * the winner's save; the ungated runs check the invariants under the natural interleaving.
 */
const REDIRECT_URI = 'https://budget.example.com/auth/callback';
const SECRET = 's3cret';
const RAW_CODE = 'raw-code';
const RAW_REFRESH = 'raw-refresh';
const FAMILY_ID = 'family-1';
const FLAG = 'auth-refresh-reuse-revocation';

function gate() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release };
}

/** Outcome of the first request to settle, or 'timeout' if all of them stay blocked. */
function firstSettled(runs: Promise<unknown>[]): Promise<string> {
  return Promise.race([
    ...runs.map((run) =>
      run.then(
        () => 'fulfilled',
        () => 'rejected',
      ),
    ),
    new Promise<string>((resolve) =>
      setTimeout(() => resolve('timeout'), 2000),
    ),
  ]);
}

async function setup() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: ENTITIES,
        migrations: MIGRATIONS,
        migrationsRun: true,
      }),
      TypeOrmModule.forFeature(ENTITIES),
    ],
    providers: [
      TypeOrmClientRepository,
      TypeOrmUserRepository,
      TypeOrmAuthorizationCodeRepository,
      TypeOrmRefreshTokenRepository,
    ],
  }).compile();
  const clients = moduleRef.get(TypeOrmClientRepository);
  const users = moduleRef.get(TypeOrmUserRepository);
  const codes = moduleRef.get(TypeOrmAuthorizationCodeRepository);
  const refreshTokens = moduleRef.get(TypeOrmRefreshTokenRepository);
  const telemetry = new FakeTelemetry();
  const featureFlags = new FakeFeatureFlags();
  const tokenService = new FakeTokenService();

  await clients.save(
    Client.create({
      id: 'budget',
      name: 'Foyer Budget',
      clientSecretHash: await hashSecret(SECRET),
      redirectUris: [REDIRECT_URI],
      logoutWebhookUrl: null,
      createdAt: new Date(),
    }),
  );
  await users.save(
    User.create({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      avatarKey: null,
      isAdmin: false,
      createdAt: new Date(),
    }),
  );

  const exchangeCode = new ExchangeCodeUseCase(
    clients,
    codes,
    refreshTokens,
    users,
    tokenService,
    telemetry,
    featureFlags,
  );
  const refresh = new RefreshTokenUseCase(
    clients,
    refreshTokens,
    users,
    tokenService,
    telemetry,
    featureFlags,
  );

  /** Every save waits for the gate to open, with the row not yet inserted. */
  function gateSaves() {
    const saves = gate();
    const save: RefreshTokenRepository['save'] =
      refreshTokens.save.bind(refreshTokens);
    vi.spyOn(refreshTokens, 'save').mockImplementation(async (token) => {
      await saves.opened;
      await save(token);
    });
    return saves;
  }

  function events(name: string) {
    return telemetry.captured
      .map(({ event }) => event)
      .filter((event) => event.name === name);
  }

  return {
    moduleRef,
    codes,
    refreshTokens,
    featureFlags,
    exchangeCode,
    refresh,
    gateSaves,
    events,
  };
}

describe('authorization code reuse race (PC2)', () => {
  async function seedCode(ctx: Awaited<ReturnType<typeof setup>>) {
    await ctx.codes.save(
      AuthorizationCode.issue({
        codeHash: hashToken(RAW_CODE),
        userId: 'user-1',
        clientId: 'budget',
        redirectUri: REDIRECT_URI,
      }),
    );
  }
  const exchange = (ctx: Awaited<ReturnType<typeof setup>>) =>
    ctx.exchangeCode.execute({
      code: RAW_CODE,
      clientId: 'budget',
      clientSecret: SECRET,
      redirectUri: REDIRECT_URI,
    });

  it('revokes the winner when the loser revoked the family before the winner saved (flag on)', async () => {
    const ctx = await setup();
    await seedCode(ctx);
    ctx.featureFlags.values.set(FLAG, true);
    const saves = ctx.gateSaves();

    const runs = [exchange(ctx), exchange(ctx)];
    // The winner is held before its INSERT: the first to settle is the loser, done revoking.
    expect(await firstSettled(runs)).toBe('rejected');
    saves.release();
    const results = await Promise.allSettled(runs);

    expect(results.map(({ status }) => status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(await ctx.refreshTokens.findAllForUser('user-1')).toEqual([]);
    expect(ctx.events('code_reused')).toHaveLength(1);
    expect(ctx.events('token_exchanged')).toEqual([]);
    expect(
      (await ctx.codes.findByCodeHash(hashToken(RAW_CODE)))?.reusedAt,
    ).toBeInstanceOf(Date);
    await ctx.moduleRef.close();
  });

  it('keeps the winner and its token while the flag is off', async () => {
    const ctx = await setup();
    await seedCode(ctx);
    const saves = ctx.gateSaves();

    const runs = [exchange(ctx), exchange(ctx)];
    expect(await firstSettled(runs)).toBe('rejected');
    saves.release();
    const results = await Promise.allSettled(runs);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(await ctx.refreshTokens.findAllForUser('user-1')).toHaveLength(1);
    expect(ctx.events('code_reused')).toHaveLength(1);
    await ctx.moduleRef.close();
  });

  it('leaves no live token after parallel redemptions of one code (flag on)', async () => {
    const ctx = await setup();
    await seedCode(ctx);
    ctx.featureFlags.values.set(FLAG, true);

    await Promise.allSettled(Array.from({ length: 5 }, () => exchange(ctx)));

    expect(await ctx.refreshTokens.findAllForUser('user-1')).toEqual([]);
    expect(ctx.events('code_reused')).toHaveLength(4);
    await ctx.moduleRef.close();
  });
});

describe('refresh token reuse race (PC1)', () => {
  async function seedToken(
    ctx: Awaited<ReturnType<typeof setup>>,
    raw: string,
    rotatedAgoMs?: number,
  ) {
    const token = RefreshToken.issue({
      id: randomUUID(),
      tokenHash: hashToken(raw),
      userId: 'user-1',
      clientId: 'budget',
      createdAt: new Date(),
      familyId: FAMILY_ID,
    });
    await ctx.refreshTokens.save(token);
    if (rotatedAgoMs !== undefined) {
      await ctx.refreshTokens.markRotated(
        token.id,
        new Date(Date.now() - rotatedAgoMs),
      );
    }
  }
  const present = (ctx: Awaited<ReturnType<typeof setup>>, raw: string) =>
    ctx.refresh.execute({
      refreshToken: raw,
      clientId: 'budget',
      clientSecret: SECRET,
    });
  const kinds = (ctx: Awaited<ReturnType<typeof setup>>) =>
    ctx
      .events('refresh_reused')
      .flatMap((event) =>
        event.name === 'refresh_reused' ? [event.properties] : [],
      );

  it('revokes the rotation and grace winners when the third presentation revokes the family first (flag on)', async () => {
    const ctx = await setup();
    await seedToken(ctx, RAW_REFRESH);
    ctx.featureFlags.values.set(FLAG, true);
    const saves = ctx.gateSaves();

    const runs = [1, 2, 3].map(() => present(ctx, RAW_REFRESH));
    // Rotation and grace winners are held before their INSERT: only the third can settle.
    expect(await firstSettled(runs)).toBe('rejected');
    saves.release();
    const results = await Promise.allSettled(runs);

    expect(results.map(({ status }) => status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(await ctx.refreshTokens.findAllForUser('user-1')).toEqual([]);
    expect(kinds(ctx)).toEqual([
      { client_id: 'budget', kind: 'grace_exhausted', revoked: true },
    ]);
    expect(ctx.events('token_exchanged')).toEqual([]);
    await ctx.moduleRef.close();
  });

  it('serves the rotation and one grace re-issue only while the flag is off', async () => {
    const ctx = await setup();
    await seedToken(ctx, RAW_REFRESH);
    const saves = ctx.gateSaves();

    const runs = [1, 2, 3].map(() => present(ctx, RAW_REFRESH));
    expect(await firstSettled(runs)).toBe('rejected');
    saves.release();
    const results = await Promise.allSettled(runs);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      2,
    );
    // The presented token (rotated) and the two pairs it gave.
    expect(await ctx.refreshTokens.findAllForUser('user-1')).toHaveLength(3);
    expect(kinds(ctx)).toContainEqual({
      client_id: 'budget',
      kind: 'grace_exhausted',
      revoked: false,
    });
    await ctx.moduleRef.close();
  });

  it('revokes a legitimate rotation in flight when an old token is replayed (flag on)', async () => {
    const ctx = await setup();
    await seedToken(ctx, 'old', 31_000);
    await seedToken(ctx, 'current');
    ctx.featureFlags.values.set(FLAG, true);
    const saves = ctx.gateSaves();

    const legit = present(ctx, 'current');
    const replay = present(ctx, 'old');
    expect(await firstSettled([legit, replay])).toBe('rejected');
    saves.release();

    await expect(legit).rejects.toThrow('Invalid refresh token');
    await expect(replay).rejects.toThrow('Invalid refresh token');
    expect(await ctx.refreshTokens.findAllForUser('user-1')).toEqual([]);
    expect(kinds(ctx)).toEqual([
      { client_id: 'budget', kind: 'rotated_after_grace', revoked: true },
    ]);
    await ctx.moduleRef.close();
  });

  it('gives at most two pairs to parallel presentations of one token', async () => {
    const ctx = await setup();
    await seedToken(ctx, RAW_REFRESH);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => present(ctx, RAW_REFRESH)),
    );

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      2,
    );
    expect(
      kinds(ctx).filter(({ kind }) => kind === 'grace_exhausted'),
    ).toHaveLength(3);
    await ctx.moduleRef.close();
  });

  it('leaves no live token once a parallel presentation revoked the family (flag on)', async () => {
    const ctx = await setup();
    await seedToken(ctx, RAW_REFRESH);
    ctx.featureFlags.values.set(FLAG, true);

    await Promise.allSettled(
      Array.from({ length: 5 }, () => present(ctx, RAW_REFRESH)),
    );

    expect(await ctx.refreshTokens.findAllForUser('user-1')).toEqual([]);
    await ctx.moduleRef.close();
  });
});
