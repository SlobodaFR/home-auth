import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

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
});
