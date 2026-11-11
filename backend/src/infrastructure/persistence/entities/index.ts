import { AuthorizationCodeOrmEntity } from './authorization-code.orm-entity';
import { ClientAccessOrmEntity } from './client-access.orm-entity';
import { ClientOrmEntity } from './client.orm-entity';
import { MagicLinkTokenOrmEntity } from './magic-link-token.orm-entity';
import { RefreshTokenOrmEntity } from './refresh-token.orm-entity';
import { UserOrmEntity } from './user.orm-entity';

/** Single list of persisted entities: database module, repositories module, migrations and tests. */
export const ENTITIES = [
  UserOrmEntity,
  ClientOrmEntity,
  ClientAccessOrmEntity,
  AuthorizationCodeOrmEntity,
  RefreshTokenOrmEntity,
  MagicLinkTokenOrmEntity,
];
