import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { serializeConnection } from './serialized-connection';

/** Used by the TypeORM CLI only (migration:generate / run / show); the app uses DatabaseModule. */
const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_PATH ?? 'data/auth.sqlite',
  entities: ENTITIES,
  migrations: MIGRATIONS,
  synchronize: false,
});
serializeConnection(dataSource);

export default dataSource;
