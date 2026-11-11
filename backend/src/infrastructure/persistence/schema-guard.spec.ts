import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { SchemaGuard } from './schema-guard';

async function migrated(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    migrations: MIGRATIONS,
  });
  await ds.initialize();
  await ds.runMigrations();
  return ds;
}

describe('SchemaGuard', () => {
  it('lets the app start when the schema matches the entities', async () => {
    const ds = await migrated();

    await expect(new SchemaGuard(ds).onModuleInit()).resolves.toBeUndefined();
    await ds.destroy();
  });

  // e.g. a production table older than the entities: IF NOT EXISTS would skip it silently.
  it('refuses to start when the schema drifted from the entities', async () => {
    const ds = await migrated();
    await ds.query(
      'ALTER TABLE "authorization_codes" DROP COLUMN "code_challenge"',
    );

    await expect(new SchemaGuard(ds).onModuleInit()).rejects.toThrow(
      'Database schema differs from the entities',
    );
    await ds.destroy();
  });
});
