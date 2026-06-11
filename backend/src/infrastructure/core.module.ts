import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationCodeRepository } from '../domain/auth/authorization-code.repository';
import { MagicLinkTokenRepository } from '../domain/auth/magic-link-token.repository';
import { RefreshTokenRepository } from '../domain/auth/refresh-token.repository';
import { SessionService } from '../domain/auth/session.service';
import { TokenService } from '../domain/auth/token.service';
import { ClientRepository } from '../domain/client/client.repository';
import { ClientAccessRepository } from '../domain/client-access/client-access.repository';
import { AvatarStorage } from '../domain/shared/avatar-storage';
import { EmailSender } from '../domain/shared/email-sender';
import { WebhookNotifier } from '../domain/shared/webhook-notifier';
import { UserRepository } from '../domain/user/user.repository';
import { AccessTokenGuard } from '../interfaces/http/guards/access-token.guard';
import { AdminGuard } from '../interfaces/http/guards/admin.guard';
import { SessionAuthGuard } from '../interfaces/http/guards/session-auth.guard';
import { JwksTokenService } from './auth/jwks-token.service';
import { JwtSessionService } from './auth/jwt-session.service';
import { RsaKeyProvider } from './auth/rsa-key-provider';
import { ResendEmailSender } from './email/resend-email-sender';
import { AuthorizationCodeOrmEntity } from './persistence/entities/authorization-code.orm-entity';
import { ClientAccessOrmEntity } from './persistence/entities/client-access.orm-entity';
import { ClientOrmEntity } from './persistence/entities/client.orm-entity';
import { MagicLinkTokenOrmEntity } from './persistence/entities/magic-link-token.orm-entity';
import { RefreshTokenOrmEntity } from './persistence/entities/refresh-token.orm-entity';
import { UserOrmEntity } from './persistence/entities/user.orm-entity';
import { TypeOrmAuthorizationCodeRepository } from './persistence/repositories/typeorm-authorization-code.repository';
import { TypeOrmClientAccessRepository } from './persistence/repositories/typeorm-client-access.repository';
import { TypeOrmClientRepository } from './persistence/repositories/typeorm-client.repository';
import { TypeOrmMagicLinkTokenRepository } from './persistence/repositories/typeorm-magic-link-token.repository';
import { TypeOrmRefreshTokenRepository } from './persistence/repositories/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './persistence/repositories/typeorm-user.repository';
import { S3AvatarStorage } from './storage/s3-avatar-storage';
import { HttpWebhookNotifier } from './webhook/http-webhook-notifier';

const ENTITIES = [
  UserOrmEntity,
  ClientOrmEntity,
  ClientAccessOrmEntity,
  AuthorizationCodeOrmEntity,
  RefreshTokenOrmEntity,
  MagicLinkTokenOrmEntity,
];

/**
 * Wires domain ports to their infrastructure implementations and exposes
 * shared HTTP guards. Imported once by AppModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [
    RsaKeyProvider,
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: ClientRepository, useClass: TypeOrmClientRepository },
    { provide: ClientAccessRepository, useClass: TypeOrmClientAccessRepository },
    { provide: AuthorizationCodeRepository, useClass: TypeOrmAuthorizationCodeRepository },
    { provide: RefreshTokenRepository, useClass: TypeOrmRefreshTokenRepository },
    { provide: MagicLinkTokenRepository, useClass: TypeOrmMagicLinkTokenRepository },
    { provide: TokenService, useClass: JwksTokenService },
    { provide: SessionService, useClass: JwtSessionService },
    { provide: EmailSender, useClass: ResendEmailSender },
    { provide: AvatarStorage, useClass: S3AvatarStorage },
    { provide: WebhookNotifier, useClass: HttpWebhookNotifier },
    SessionAuthGuard,
    AdminGuard,
    AccessTokenGuard,
  ],
  exports: [
    UserRepository,
    ClientRepository,
    ClientAccessRepository,
    AuthorizationCodeRepository,
    RefreshTokenRepository,
    MagicLinkTokenRepository,
    TokenService,
    SessionService,
    EmailSender,
    AvatarStorage,
    WebhookNotifier,
    SessionAuthGuard,
    AdminGuard,
    AccessTokenGuard,
  ],
})
export class CoreModule {}
