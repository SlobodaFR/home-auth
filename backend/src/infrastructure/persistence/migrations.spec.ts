import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { InitialSchema1794400000000 } from './migrations/1794400000000-InitialSchema';

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
});
