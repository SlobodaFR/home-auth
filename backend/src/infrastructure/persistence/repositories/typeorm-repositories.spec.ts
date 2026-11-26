import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationCode } from '../../../domain/auth/authorization-code';
import {
  LINK_BUDGET_WINDOW_MS,
  MagicLinkToken,
} from '../../../domain/auth/magic-link-token';
import { RefreshToken } from '../../../domain/auth/refresh-token';
import { Client } from '../../../domain/client/client';
import { ClientAccess } from '../../../domain/client-access/client-access';
import { hashToken } from '../../../domain/shared/hash';
import { User } from '../../../domain/user/user';
import { ENTITIES } from '../entities';
import { TypeOrmAuthorizationCodeRepository } from './typeorm-authorization-code.repository';
import { TypeOrmClientAccessRepository } from './typeorm-client-access.repository';
import { TypeOrmClientRepository } from './typeorm-client.repository';
import { TypeOrmMagicLinkTokenRepository } from './typeorm-magic-link-token.repository';
import { TypeOrmRefreshTokenRepository } from './typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './typeorm-user.repository';
import { serializedTypeOrmRoot } from '../../../test-support/serialized-typeorm';

async function createTestingModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      serializedTypeOrmRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: ENTITIES,
        synchronize: true,
      }),
      TypeOrmModule.forFeature(ENTITIES),
    ],
    providers: [
      TypeOrmUserRepository,
      TypeOrmClientRepository,
      TypeOrmClientAccessRepository,
      TypeOrmAuthorizationCodeRepository,
      TypeOrmRefreshTokenRepository,
      TypeOrmMagicLinkTokenRepository,
    ],
  }).compile();
  return moduleRef;
}

describe('TypeOrmUserRepository', () => {
  it('persists and retrieves a user', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmUserRepository);

    const user = User.create({
      id: 'user-1',
      email: 'Alice@Example.com',
      name: 'Alice',
      avatarKey: null,
      isAdmin: true,
      createdAt: new Date(),
    });
    await repository.save(user);

    expect((await repository.findById('user-1'))?.email).toBe(
      'alice@example.com',
    );
    expect((await repository.findByEmail('alice@example.com'))?.isAdmin).toBe(
      true,
    );
    expect(await repository.count()).toBe(1);
    expect(await repository.findAll()).toHaveLength(1);

    await moduleRef.close();
  });

  it('revokeSessions increments atomically; a stale save never undoes it', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmUserRepository);

    const stale = User.create({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      avatarKey: null,
      isAdmin: false,
      createdAt: new Date(),
    });
    await repository.save(stale);
    expect((await repository.findById('user-1'))?.sessionVersion).toBe(0);

    expect(await repository.revokeSessions('user-1')).toBe(true);
    expect(await repository.revokeSessions('user-1')).toBe(true);
    expect((await repository.findById('user-1'))?.sessionVersion).toBe(2);

    // A profile update that read the user before the revocation saves it back.
    await repository.save(stale.rename('Alice B'));
    const after = await repository.findById('user-1');
    expect(after?.name).toBe('Alice B');
    expect(after?.sessionVersion).toBe(2);

    expect(await repository.revokeSessions('unknown')).toBe(false);

    await moduleRef.close();
  });
});

describe('TypeOrmClientRepository', () => {
  it('persists, updates, and deletes a client', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmClientRepository);

    const client = Client.create({
      id: 'budget',
      name: 'Foyer Budget',
      clientSecretHash: 'hash',
      redirectUris: ['https://budget.example.com/auth/callback'],
      logoutWebhookUrl: 'https://budget.example.com/internal/session-revoked',
      createdAt: new Date(),
    });
    await repository.save(client);

    const stored = await repository.findById('budget');
    expect(stored?.redirectUris).toEqual([
      'https://budget.example.com/auth/callback',
    ]);
    expect(stored?.logoutWebhookUrl).toBe(
      'https://budget.example.com/internal/session-revoked',
    );

    await repository.save(client.update({ name: 'Foyer Budget v2' }));
    expect((await repository.findById('budget'))?.name).toBe('Foyer Budget v2');

    await repository.delete('budget');
    expect(await repository.findById('budget')).toBeNull();

    await moduleRef.close();
  });

  it('persists the webhook secrets and keeps them across other updates', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmClientRepository);
    const now = new Date('2026-01-01T00:00:00Z');
    const client = Client.create({
      id: 'budget',
      name: 'Foyer Budget',
      clientSecretHash: 'hash',
      redirectUris: ['https://budget.example.com/auth/callback'],
      logoutWebhookUrl: null,
      createdAt: now,
    });
    await repository.save(client);
    expect((await repository.findById('budget'))?.hasWebhookSecret).toBe(false);

    await repository.save(
      client
        .regenerateWebhookSecret('s1', now)
        .regenerateWebhookSecret('s2', now),
    );
    const stored = await repository.findById('budget');
    expect(stored?.webhookSecret).toBe('s2');
    expect(stored?.webhookSecretPrevious).toBe('s1');
    expect(stored?.webhookSecretPreviousExpiresAt).toEqual(
      new Date('2026-01-02T00:00:00Z'),
    );

    // An unrelated update (the admin edits the name) must not wipe the secrets.
    await repository.save(stored!.update({ name: 'Renamed' }));
    expect(
      (await repository.findById('budget'))?.activeWebhookSecrets(now),
    ).toEqual(['s2', 's1']);

    await moduleRef.close();
  });
});

describe('TypeOrmClientAccessRepository', () => {
  it('grants, checks, lists, and revokes access', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmClientAccessRepository);

    await repository.grant(
      ClientAccess.create({ userId: 'user-1', clientId: 'budget' }),
    );
    expect(await repository.exists('user-1', 'budget')).toBe(true);
    expect(await repository.findByClientId('budget')).toEqual([
      ClientAccess.create({ userId: 'user-1', clientId: 'budget' }),
    ]);

    await repository.revoke('user-1', 'budget');
    expect(await repository.exists('user-1', 'budget')).toBe(false);

    await moduleRef.close();
  });

  it('counts access per client and revokes all access of a client', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmClientAccessRepository);

    for (const [userId, clientId] of [
      ['user-1', 'budget'],
      ['user-2', 'budget'],
      ['user-1', 'trainer'],
    ]) {
      await repository.grant(ClientAccess.create({ userId, clientId }));
    }
    expect(await repository.countAllByClientId()).toEqual(
      new Map([
        ['budget', 2],
        ['trainer', 1],
      ]),
    );

    await repository.revokeAllByClientId('budget');
    expect(await repository.countAllByClientId()).toEqual(
      new Map([['trainer', 1]]),
    );

    await moduleRef.close();
  });
});

describe('TypeOrmAuthorizationCodeRepository', () => {
  it('persists and retrieves an authorization code', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmAuthorizationCodeRepository);

    const code = AuthorizationCode.issue({
      codeHash: hashToken('raw-code'),
      userId: 'user-1',
      clientId: 'budget',
      redirectUri: 'https://budget.example.com/auth/callback',
    });
    await repository.save(code);

    const stored = await repository.findByCodeHash(hashToken('raw-code'));
    expect(stored?.userId).toBe('user-1');
    expect(stored?.used).toBe(false);

    await repository.save(stored!.redeem());
    expect((await repository.findByCodeHash(hashToken('raw-code')))?.used).toBe(
      true,
    );

    await moduleRef.close();
  });
});

describe('authorization code reuse marker (PC2)', () => {
  const issue = (codeHash: string, issuedAt = new Date()) =>
    AuthorizationCode.issue({
      codeHash,
      userId: 'user-1',
      clientId: 'budget',
      redirectUri: 'https://budget.example.com/cb',
      issuedAt,
    });

  it('records the first reuse date only, and ignores an unknown code', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmAuthorizationCodeRepository);
    await repository.save(issue('code'));
    expect((await repository.findByCodeHash('code'))?.reusedAt).toBeNull();
    const first = new Date('2026-01-01T00:00:00Z');

    await repository.markReused('code', first);
    await repository.markReused('code', new Date('2026-01-01T00:00:05Z'));
    await repository.markReused('unknown', first);

    expect((await repository.findByCodeHash('code'))?.reusedAt).toEqual(first);
    expect(await repository.findByCodeHash('unknown')).toBeNull();
    await moduleRef.close();
  });

  it('keeps the marker when the code is redeemed afterwards', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmAuthorizationCodeRepository);
    const now = new Date();
    await repository.save(issue('code', now));
    await repository.markReused('code', now);

    expect(await repository.markRedeemed('code', now)).toBe(true);
    expect((await repository.findByCodeHash('code'))?.reusedAt).toEqual(now);
    await moduleRef.close();
  });

  it('purges a reused code with the other expired codes', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmAuthorizationCodeRepository);
    const issuedAt = new Date('2026-01-01T00:00:00Z');
    await repository.save(issue('reused', issuedAt));
    await repository.markReused('reused', issuedAt);

    expect(
      await repository.deleteExpiredBefore(new Date('2026-01-02T00:00:00Z')),
    ).toBe(1);
    expect(await repository.findByCodeHash('reused')).toBeNull();
    await moduleRef.close();
  });
});

describe('TypeOrmRefreshTokenRepository', () => {
  it('persists, finds, and deletes refresh tokens', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);

    const token = RefreshToken.issue({
      id: randomUUID(),
      tokenHash: hashToken('raw-refresh'),
      userId: 'user-1',
      clientId: 'budget',
      createdAt: new Date(),
    });
    await repository.save(token);

    expect(
      (await repository.findByTokenHash(hashToken('raw-refresh')))?.id,
    ).toBe(token.id);
    expect(await repository.findAllForUser('user-1')).toHaveLength(1);

    await repository.deleteById(token.id);
    expect(
      await repository.findByTokenHash(hashToken('raw-refresh')),
    ).toBeNull();

    await repository.save(token);
    await repository.deleteAllForUser('user-1');
    expect(await repository.findAllForUser('user-1')).toHaveLength(0);

    await moduleRef.close();
  });

  function member(id: string, familyId: string) {
    return RefreshToken.issue({
      id,
      tokenHash: `hash-${id}`,
      userId: 'user-1',
      clientId: 'budget',
      createdAt: new Date(),
      familyId,
    });
  }

  it('persists the family and the rotation date', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    await repository.save(member('a', 'family-1'));

    const stored = await repository.findByTokenHash('hash-a');

    expect(stored?.familyId).toBe('family-1');
    expect(stored?.rotatedAt).toBeNull();
    await moduleRef.close();
  });

  // better-sqlite3 runs in-process and SQLite has a single writer: this proves one winner per
  // conditional UPDATE, which is all the atomicity the service relies on.
  it('marks a token rotated only once (atomic conditional update)', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    await repository.save(member('a', 'family-1'));
    const at = new Date('2026-01-01T00:00:00Z');

    const results = await Promise.all([
      repository.markRotated('a', at),
      repository.markRotated('a', new Date()),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.findByTokenHash('hash-a'))?.rotatedAt).toEqual(at);
    expect(await repository.markRotated('unknown', at)).toBe(false);
    await moduleRef.close();
  });

  it('deletes the tokens rotated before a date, keeps the others', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    await repository.save(member('old', 'family-1'));
    await repository.save(member('recent', 'family-1'));
    await repository.save(member('current', 'family-1'));
    await repository.markRotated('old', new Date('2026-01-01T00:00:00Z'));
    await repository.markRotated('recent', new Date('2026-01-03T00:00:00Z'));

    expect(
      await repository.deleteRotatedBefore(new Date('2026-01-02T00:00:00Z')),
    ).toBe(1);

    expect(await repository.findByTokenHash('hash-old')).toBeNull();
    expect(await repository.findByTokenHash('hash-recent')).not.toBeNull();
    expect(await repository.findByTokenHash('hash-current')).not.toBeNull();
    await moduleRef.close();
  });

  // Same single-writer argument as markRotated: one winner for the single grace re-issue.
  it('spends the grace of a rotated token only once (atomic conditional update)', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    await repository.save(member('a', 'family-1'));
    await repository.save(member('unrotated', 'family-1'));
    await repository.markRotated('a', new Date('2026-01-01T00:00:00Z'));
    const at = new Date('2026-01-01T00:00:10Z');

    const results = await Promise.all([
      repository.claimGrace('a', at),
      repository.claimGrace('a', new Date()),
      repository.claimGrace('a', new Date()),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.findByTokenHash('hash-a'))?.graceUsedAt).toEqual(
      at,
    );
    expect(await repository.claimGrace('unrotated', at)).toBe(false);
    expect(
      (await repository.findByTokenHash('hash-unrotated'))?.graceUsedAt,
    ).toBeNull();
    expect(await repository.claimGrace('unknown', at)).toBe(false);
    await moduleRef.close();
  });

  it('purges a rotated token with its spent grace after the retention', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    await repository.save(member('old', 'family-1'));
    await repository.markRotated('old', new Date('2026-01-01T00:00:00Z'));
    await repository.claimGrace('old', new Date('2026-01-01T00:00:05Z'));

    expect(
      await repository.deleteRotatedBefore(new Date('2026-01-02T00:00:00Z')),
    ).toBe(1);
    expect(await repository.findByTokenHash('hash-old')).toBeNull();
    await moduleRef.close();
  });

  it('deletes a whole family and only it', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    await repository.save(member('a', 'family-1'));
    await repository.save(member('b', 'family-1'));
    await repository.save(member('c', 'family-2'));

    expect(await repository.deleteFamily('family-1')).toBe(2);

    expect(await repository.findByTokenHash('hash-a')).toBeNull();
    expect(await repository.findByTokenHash('hash-b')).toBeNull();
    expect(await repository.findByTokenHash('hash-c')).not.toBeNull();
    await moduleRef.close();
  });
});

describe('TypeOrmMagicLinkTokenRepository', () => {
  it('persists and retrieves a magic link token', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmMagicLinkTokenRepository);

    const token = MagicLinkToken.issue({
      id: randomUUID(),
      email: 'alice@example.com',
      tokenHash: hashToken('raw'),
    });
    await repository.save(token);

    expect((await repository.findByTokenHash(hashToken('raw')))?.email).toBe(
      'alice@example.com',
    );

    await moduleRef.close();
  });
  it('counts tokens issued for an email since a given date', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmMagicLinkTokenRepository);
    const now = Date.now();
    const issue = (email: string, msAgo: number, raw: string) =>
      repository.save(
        MagicLinkToken.issue({
          id: randomUUID(),
          email,
          tokenHash: hashToken(raw),
          issuedAt: new Date(now - msAgo),
        }),
      );

    await issue('alice@example.com', 10 * 60 * 1000, 'a1');
    await issue('alice@example.com', 50 * 60 * 1000, 'a2');
    await issue('alice@example.com', 70 * 60 * 1000, 'a3');
    await issue('bob@example.com', 10 * 60 * 1000, 'b1');

    expect(
      await repository.countIssuedSince(
        'alice@example.com',
        new Date(now - 60 * 60 * 1000),
      ),
    ).toBe(2);

    await moduleRef.close();
  });
});

describe('purge of expired tokens (#29)', () => {
  const HOUR = 60 * 60 * 1000;
  const now = Date.now();

  it('deletes authorization codes that expired before the date, keeps the others', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmAuthorizationCodeRepository);
    const issue = (codeHash: string, issuedAt: number) =>
      AuthorizationCode.issue({
        codeHash,
        userId: 'user-1',
        clientId: 'budget',
        redirectUri: 'https://budget.example.com/cb',
        issuedAt: new Date(issuedAt),
      });
    await repository.save(issue('old', now - 3 * HOUR));
    await repository.save(issue('recent', now));

    expect(await repository.deleteExpiredBefore(new Date(now - HOUR))).toBe(1);
    expect(await repository.findByCodeHash('old')).toBeNull();
    expect(await repository.findByCodeHash('recent')).not.toBeNull();
    await moduleRef.close();
  });

  it('deletes refresh tokens that expired before the date, keeps the others', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmRefreshTokenRepository);
    const issue = (id: string, createdAt: number) =>
      RefreshToken.issue({
        id,
        tokenHash: `hash-${id}`,
        userId: 'user-1',
        clientId: 'budget',
        createdAt: new Date(createdAt),
      });
    await repository.save(issue('expired', now - 31 * 24 * HOUR));
    await repository.save(issue('valid', now));

    expect(await repository.deleteExpiredBefore(new Date(now))).toBe(1);
    expect(await repository.findByTokenHash('hash-expired')).toBeNull();
    expect(await repository.findByTokenHash('hash-valid')).not.toBeNull();
    await moduleRef.close();
  });

  it('deletes magic links that expired before the date without shrinking the per-email budget', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmMagicLinkTokenRepository);
    const issue = (n: number, issuedAt: number) =>
      MagicLinkToken.issue({
        id: `t${n.toString()}`,
        email: 'a@b.c',
        tokenHash: `h${n.toString()}`,
        issuedAt: new Date(issuedAt),
      });
    await repository.save(issue(1, now - 10 * 60 * 1000));
    await repository.save(issue(2, now - 40 * 60 * 1000));
    await repository.save(issue(3, now - 2 * HOUR));
    const windowStart = new Date(now - LINK_BUDGET_WINDOW_MS);

    expect(await repository.deleteExpiredBefore(windowStart)).toBe(1);
    expect(await repository.countIssuedSince('a@b.c', windowStart)).toBe(2);
    expect(await repository.findByTokenHash('h3')).toBeNull();
    await moduleRef.close();
  });
});

describe('atomic single use (#20)', () => {
  it('redeems an authorization code once, and never an expired one', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmAuthorizationCodeRepository);
    const now = new Date();
    await repository.save(
      AuthorizationCode.issue({
        codeHash: 'fresh',
        userId: 'u',
        clientId: 'c',
        redirectUri: 'https://c/cb',
        issuedAt: now,
      }),
    );
    await repository.save(
      AuthorizationCode.issue({
        codeHash: 'stale',
        userId: 'u',
        clientId: 'c',
        redirectUri: 'https://c/cb',
        issuedAt: new Date(now.getTime() - 60 * 60 * 1000),
      }),
    );

    expect(await repository.markRedeemed('fresh', now)).toBe(true);
    expect(await repository.markRedeemed('fresh', now)).toBe(false);
    expect((await repository.findByCodeHash('fresh'))?.used).toBe(true);
    expect(await repository.markRedeemed('stale', now)).toBe(false);
    await moduleRef.close();
  });

  it('consumes a magic link once, and never an expired one', async () => {
    const moduleRef = await createTestingModule();
    const repository = moduleRef.get(TypeOrmMagicLinkTokenRepository);
    const now = new Date();
    await repository.save(
      MagicLinkToken.issue({
        id: 'm1',
        email: 'a@b.c',
        tokenHash: 'fresh',
        issuedAt: now,
      }),
    );
    await repository.save(
      MagicLinkToken.issue({
        id: 'm2',
        email: 'a@b.c',
        tokenHash: 'stale',
        issuedAt: new Date(now.getTime() - 60 * 60 * 1000),
      }),
    );

    expect(await repository.markConsumed('fresh', now)).toBe(true);
    expect(await repository.markConsumed('fresh', now)).toBe(false);
    expect(
      (await repository.findByTokenHash('fresh'))?.consumedAt,
    ).not.toBeNull();
    expect(await repository.markConsumed('stale', now)).toBe(false);
    await moduleRef.close();
  });
});
