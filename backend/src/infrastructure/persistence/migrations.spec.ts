import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { InitialSchema1794400000000 } from './migrations/1794400000000-InitialSchema';
import { AddClientWebhookSecrets1794600000000 } from './migrations/1794600000000-AddClientWebhookSecrets';
import { AddUserSessionVersion1794700000000 } from './migrations/1794700000000-AddUserSessionVersion';
import { AddRefreshTokenFamilies1794800000000 } from './migrations/1794800000000-AddRefreshTokenFamilies';

function dataSource(database: string, synchronize = false): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize,
  });
}

describe('database migrations', () => {
  // Any entity change without its migration makes this fail.
  it('produce exactly the schema the entities describe', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();

    const pending = await ds.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
    await ds.destroy();
  });

  // Production was created by synchronize: true; the first migration must adopt it untouched.
  it('adopt a database created by synchronize without losing data', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'prod.sqlite');
    const legacy = dataSource(file, true);
    await legacy.initialize();
    await legacy.query(
      "INSERT INTO users (id, email, name, is_admin, created_at) VALUES ('u1', 'a@example.com', 'Alice', 1, datetime('now'))",
    );
    await legacy.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    const applied = await migrated.runMigrations();

    expect(applied.map((migration) => migration.name)).toEqual(
      MIGRATIONS.map((migration) => migration.name),
    );
    expect(await migrated.query('SELECT id, email FROM users')).toEqual([
      { id: 'u1', email: 'a@example.com' },
    ]);
    expect(
      (await migrated.driver.createSchemaBuilder().log()).upQueries,
    ).toEqual([]);
    await migrated.destroy();
  });

  it('add users.session_version with 0 for existing users', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'old.sqlite');
    const old = new DataSource({
      type: 'better-sqlite3',
      database: file,
      entities: ENTITIES,
      migrations: [InitialSchema1794400000000],
      synchronize: false,
    });
    await old.initialize();
    await old.runMigrations();
    await old.query(
      "INSERT INTO users (id, email, name, is_admin, created_at) VALUES ('u1', 'a@example.com', 'Alice', 1, datetime('now'))",
    );
    await old.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    await migrated.runMigrations();

    expect(
      await migrated.query('SELECT id, session_version FROM users'),
    ).toEqual([{ id: 'u1', session_version: 0 }]);
    await migrated.destroy();
  });

  it('make the session_version migration a no-op when the column already exists', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();

    const queryRunner = ds.createQueryRunner();
    await new AddUserSessionVersion1794700000000().up(queryRunner);
    await queryRunner.release();

    expect(await ds.query('PRAGMA table_info("users")')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'session_version' }),
      ]),
    );
    await ds.destroy();
  });

  it('add the webhook secret columns to an existing clients table, without touching its rows', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'prod.sqlite');
    const before = new DataSource({
      type: 'better-sqlite3',
      database: file,
      entities: ENTITIES,
      migrations: [InitialSchema1794400000000],
      synchronize: false,
    });
    await before.initialize();
    await before.runMigrations();
    await before.query(
      "INSERT INTO clients (id, name, client_secret_hash, redirect_uris, logout_webhook_url) VALUES ('budget', 'Budget', 'h', '[]', 'https://b.example.com/h?secret=x')",
    );
    await before.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    await migrated.runMigrations();

    expect(
      await migrated.query(
        'SELECT id, logout_webhook_url, webhook_secret, webhook_secret_previous, webhook_secret_previous_expires_at FROM clients',
      ),
    ).toEqual([
      {
        id: 'budget',
        logout_webhook_url: 'https://b.example.com/h?secret=x',
        webhook_secret: null,
        webhook_secret_previous: null,
        webhook_secret_previous_expires_at: null,
      },
    ]);
    expect(
      (await migrated.driver.createSchemaBuilder().log()).upQueries,
    ).toEqual([]);
    await migrated.destroy();
  });

  // The webhook secrets migration (1794600000000) was merged after 1794700000000..1794900000000
  // had already run in production: TypeORM must still apply it, whatever the timestamps order.
  it('apply the webhook secrets migration on a database already at the latest previous schema', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'prod.sqlite');
    const before = new DataSource({
      type: 'better-sqlite3',
      database: file,
      migrations: MIGRATIONS.filter(
        (migration) => migration !== AddClientWebhookSecrets1794600000000,
      ),
    });
    await before.initialize();
    await before.runMigrations();
    await before.query(
      "INSERT INTO clients (id, name, client_secret_hash, redirect_uris, logout_webhook_url) VALUES ('budget', 'Budget', 'h', '[]', 'https://b.example.com/h?secret=x')",
    );
    await before.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    const applied = await migrated.runMigrations();

    expect(applied.map((migration) => migration.name)).toEqual([
      'AddClientWebhookSecrets1794600000000',
    ]);
    expect(
      await migrated.query(
        'SELECT id, logout_webhook_url, webhook_secret FROM clients',
      ),
    ).toEqual([
      {
        id: 'budget',
        logout_webhook_url: 'https://b.example.com/h?secret=x',
        webhook_secret: null,
      },
    ]);
    expect(
      (await migrated.driver.createSchemaBuilder().log()).upQueries,
    ).toEqual([]);
    await migrated.destroy();
  });

  it('make the webhook secrets migration a no-op when the columns already exist', async () => {
    const ds = dataSource(':memory:');
    await ds.initialize();
    await ds.runMigrations();

    const queryRunner = ds.createQueryRunner();
    await new AddClientWebhookSecrets1794600000000().up(queryRunner);
    await queryRunner.release();

    expect(
      (await ds.query('PRAGMA table_info("clients")')).map(
        (column: { name: string }) => column.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'webhook_secret',
        'webhook_secret_previous',
        'webhook_secret_previous_expires_at',
      ]),
    );
    await ds.destroy();
  });

  it('backfill each existing refresh token as its own family, not rotated', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'prod.sqlite');
    const before = new DataSource({
      type: 'better-sqlite3',
      database: file,
      migrations: [InitialSchema1794400000000],
    });
    await before.initialize();
    await before.runMigrations();
    await before.query(
      "INSERT INTO refresh_tokens (id, token_hash, user_id, client_id, expires_at) VALUES ('rt1', 'h1', 'u1', 'budget', datetime('now', '+1 day'))",
    );
    await before.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    await migrated.runMigrations();

    expect(
      await migrated.query(
        'SELECT id, family_id, rotated_at FROM refresh_tokens',
      ),
    ).toEqual([{ id: 'rt1', family_id: 'rt1', rotated_at: null }]);
    await migrated.destroy();
  });

  it('add empty reuse markers to a database at the previous schema, keeping its rows', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'prod.sqlite');
    const before = new DataSource({
      type: 'better-sqlite3',
      database: file,
      migrations: [
        InitialSchema1794400000000,
        AddClientWebhookSecrets1794600000000,
        AddUserSessionVersion1794700000000,
        AddRefreshTokenFamilies1794800000000,
      ],
    });
    await before.initialize();
    await before.runMigrations();
    await before.query(
      "INSERT INTO refresh_tokens (id, token_hash, user_id, client_id, expires_at, family_id, rotated_at) VALUES ('rt1', 'h1', 'u1', 'budget', datetime('now', '+1 day'), 'f1', datetime('now'))",
    );
    await before.query(
      "INSERT INTO authorization_codes (code_hash, user_id, client_id, redirect_uri, expires_at, used) VALUES ('c1', 'u1', 'budget', 'https://b/cb', datetime('now', '+1 minute'), 1)",
    );
    await before.destroy();

    const migrated = dataSource(file);
    await migrated.initialize();
    const applied = await migrated.runMigrations();

    expect(applied.map((migration) => migration.name)).toEqual([
      'AddTokenReuseMarkers1794900000000',
    ]);
    expect(
      await migrated.query(
        'SELECT id, family_id, grace_used_at FROM refresh_tokens',
      ),
    ).toEqual([{ id: 'rt1', family_id: 'f1', grace_used_at: null }]);
    expect(
      await migrated.query(
        'SELECT code_hash, used, reused_at FROM authorization_codes',
      ),
    ).toEqual([{ code_hash: 'c1', used: 1, reused_at: null }]);
    expect(
      (await migrated.driver.createSchemaBuilder().log()).upQueries,
    ).toEqual([]);
    await migrated.destroy();
  });
});
