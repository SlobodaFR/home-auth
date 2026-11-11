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
import { AuthorizationCodeOrmEntity } from '../entities/authorization-code.orm-entity';
import { ClientAccessOrmEntity } from '../entities/client-access.orm-entity';
import { ClientOrmEntity } from '../entities/client.orm-entity';
import { MagicLinkTokenOrmEntity } from '../entities/magic-link-token.orm-entity';
import { RefreshTokenOrmEntity } from '../entities/refresh-token.orm-entity';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { TypeOrmAuthorizationCodeRepository } from './typeorm-authorization-code.repository';
import { TypeOrmClientAccessRepository } from './typeorm-client-access.repository';
import { TypeOrmClientRepository } from './typeorm-client.repository';
import { TypeOrmMagicLinkTokenRepository } from './typeorm-magic-link-token.repository';
import { TypeOrmRefreshTokenRepository } from './typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './typeorm-user.repository';

const ENTITIES = [
  UserOrmEntity,
  ClientOrmEntity,
  ClientAccessOrmEntity,
  AuthorizationCodeOrmEntity,
  RefreshTokenOrmEntity,
  MagicLinkTokenOrmEntity,
];

async function createTestingModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
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
