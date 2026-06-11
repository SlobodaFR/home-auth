import { AuthorizationCode } from '../../domain/auth/authorization-code';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { SessionService } from '../../domain/auth/session.service';
import {
  AccessTokenClaims,
  AccessTokenPayload,
  ACCESS_TOKEN_TTL,
  JsonWebKeySet,
  TokenService,
} from '../../domain/auth/token.service';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';
import { ClientAccess } from '../../domain/client-access/client-access';
import { ClientAccessRepository } from '../../domain/client-access/client-access.repository';
import { AvatarStorage, StoredAvatar } from '../../domain/shared/avatar-storage';
import { EmailMessage, EmailSender } from '../../domain/shared/email-sender';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

export class InMemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    return [...this.users.values()].find((user) => user.email === normalized) ?? null;
  }

  async findAll(): Promise<User[]> {
    return [...this.users.values()];
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async count(): Promise<number> {
    return this.users.size;
  }
}

export class InMemoryClientRepository extends ClientRepository {
  private readonly clients = new Map<string, Client>();

  async findById(id: string): Promise<Client | null> {
    return this.clients.get(id) ?? null;
  }

  async findAll(): Promise<Client[]> {
    return [...this.clients.values()];
  }

  async save(client: Client): Promise<void> {
    this.clients.set(client.id, client);
  }

  async delete(id: string): Promise<void> {
    this.clients.delete(id);
  }
}

export class InMemoryClientAccessRepository extends ClientAccessRepository {
  private readonly entries = new Set<string>();

  private static key(userId: string, clientId: string): string {
    return `${userId}::${clientId}`;
  }

  async exists(userId: string, clientId: string): Promise<boolean> {
    return this.entries.has(InMemoryClientAccessRepository.key(userId, clientId));
  }

  async grant(access: ClientAccess): Promise<void> {
    this.entries.add(InMemoryClientAccessRepository.key(access.userId, access.clientId));
  }

  async revoke(userId: string, clientId: string): Promise<void> {
    this.entries.delete(InMemoryClientAccessRepository.key(userId, clientId));
  }

  async findByClientId(clientId: string): Promise<ClientAccess[]> {
    return [...this.entries]
      .filter((key) => key.endsWith(`::${clientId}`))
      .map((key) => ClientAccess.create({ userId: key.split('::')[0], clientId }));
  }
}

export class InMemoryAuthorizationCodeRepository extends AuthorizationCodeRepository {
  private readonly codes = new Map<string, AuthorizationCode>();

  async save(code: AuthorizationCode): Promise<void> {
    this.codes.set(code.codeHash, code);
  }

  async findByCodeHash(codeHash: string): Promise<AuthorizationCode | null> {
    return this.codes.get(codeHash) ?? null;
  }
}

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  private readonly tokens = new Map<string, RefreshToken>();

  async save(token: RefreshToken): Promise<void> {
    this.tokens.set(token.id, token);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return [...this.tokens.values()].find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async findAllForUser(userId: string): Promise<RefreshToken[]> {
    return [...this.tokens.values()].filter((token) => token.userId === userId);
  }

  async deleteById(id: string): Promise<void> {
    this.tokens.delete(id);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const token of [...this.tokens.values()]) {
      if (token.userId === userId) {
        this.tokens.delete(token.id);
      }
    }
  }
}

export class InMemoryMagicLinkTokenRepository extends MagicLinkTokenRepository {
  private readonly tokens = new Map<string, MagicLinkToken>();

  async save(token: MagicLinkToken): Promise<void> {
    this.tokens.set(token.tokenHash, token);
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    return this.tokens.get(tokenHash) ?? null;
  }
}

export class FakeEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class FakeTokenService extends TokenService {
  async signAccessToken(payload: AccessTokenPayload, ttlSeconds: number = ACCESS_TOKEN_TTL): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = { ...payload, iat: now, exp: now + ttlSeconds };
    return JSON.stringify(claims);
  }

  async verifyAccessToken(token: string, audience?: string): Promise<AccessTokenClaims | null> {
    try {
      const claims = JSON.parse(token) as AccessTokenClaims;
      if (audience && claims.aud !== audience) {
        return null;
      }
      if (claims.exp * 1000 < Date.now()) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }

  async getJwks(): Promise<JsonWebKeySet> {
    return { keys: [] };
  }
}

export class FakeSessionService extends SessionService {
  async sign(userId: string): Promise<string> {
    return `session:${userId}`;
  }

  async verify(token: string): Promise<string | null> {
    return token.startsWith('session:') ? token.slice('session:'.length) : null;
  }
}

export class FakeAvatarStorage extends AvatarStorage {
  private readonly avatars = new Map<string, StoredAvatar>();

  async upload(userId: string, avatar: StoredAvatar): Promise<string> {
    const key = `auth-avatars/test/${userId}`;
    this.avatars.set(key, avatar);
    return key;
  }

  async get(avatarKey: string): Promise<StoredAvatar | null> {
    return this.avatars.get(avatarKey) ?? null;
  }

  async delete(avatarKey: string): Promise<void> {
    this.avatars.delete(avatarKey);
  }
}

export class FakeWebhookNotifier extends WebhookNotifier {
  readonly calls: { url: string; payload: Record<string, unknown> }[] = [];

  async notify(url: string, payload: Record<string, unknown>): Promise<void> {
    this.calls.push({ url, payload });
  }
}

export class FakeConfigService {
  constructor(private readonly values: Record<string, string> = {}) {}

  get<T = string>(key: string, defaultValue?: T): T | undefined {
    return (this.values[key] as T | undefined) ?? defaultValue;
  }
}
