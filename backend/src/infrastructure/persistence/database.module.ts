import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { SLOW_QUERY_THRESHOLD_MS, SlowQueryLogger } from './slow-query.logger';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('DATABASE_PATH', 'data/auth.sqlite'),
        // WAL mode is required for Litestream replication.
        enableWAL: true,
        maxQueryExecutionTime: SLOW_QUERY_THRESHOLD_MS,
        logger: new SlowQueryLogger(),
        entities: ENTITIES,
        // Schema changes only through reviewed migrations: synchronize could rebuild a SQLite
        // table and drop data, which Litestream would then replicate.
        synchronize: false,
        migrations: MIGRATIONS,
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
