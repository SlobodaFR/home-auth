import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationCodeOrmEntity } from './entities/authorization-code.orm-entity';
import { ClientAccessOrmEntity } from './entities/client-access.orm-entity';
import { ClientOrmEntity } from './entities/client.orm-entity';
import { MagicLinkTokenOrmEntity } from './entities/magic-link-token.orm-entity';
import { RefreshTokenOrmEntity } from './entities/refresh-token.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';

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
        entities: [
          UserOrmEntity,
          ClientOrmEntity,
          ClientAccessOrmEntity,
          AuthorizationCodeOrmEntity,
          RefreshTokenOrmEntity,
          MagicLinkTokenOrmEntity,
        ],
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
