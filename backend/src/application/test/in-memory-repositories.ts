import { AuthorizationCode } from '../../domain/auth/authorization-code';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import {
  RefreshToken,
  RefreshTokenProps,
} from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import {
  SessionService,
  VerifiedSession,
} from '../../domain/auth/session.service';
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
import {
  AvatarStorage,
  StoredAvatar,
} from '../../domain/shared/avatar-storage';
import { EmailMessage, EmailSender } from '../../domain/shared/email-sender';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { Telemetry, TelemetryEvent } from '../../domain/shared/telemetry';
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
    return (
      [...this.users.values()].find((user) => user.email === normalized) ?? null
    );
  }

  async findAll(): Promise<User[]> {
    return [...this.users.values()];
  }

  async save(user: User): Promise<void> {
    // Like the real repository: save never changes the stored session version.
    const stored = this.users.get(user.id);
    this.users.set(
      user.id,
      stored
        ? User.create({
            id: user.id,
            email: user.email,
            name: user.name,
            avatarKey: user.avatarKey,
            isAdmin: user.isAdmin,
            countryCode: user.countryCode,
            locale: user.locale,
            createdAt: user.createdAt,
            sessionVersion: stored.sessionVersion,
          })
        : user,
    );
  }

  async revokeSessions(userId: string): Promise<boolean> {
    const stored = this.users.get(userId);
    if (!stored) {
      return false;
    }
    this.users.set(userId, stored.revokeSessions());
    return true;
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
    return this.entries.has(
      InMemoryClientAccessRepository.key(userId, clientId),
    );
  }

  async grant(access: ClientAccess): Promise<void> {
    this.entries.add(
      InMemoryClientAccessRepository.key(access.userId, access.clientId),
    );
  }

  async revoke(userId: string, clientId: string): Promise<void> {
    this.entries.delete(InMemoryClientAccessRepository.key(userId, clientId));
  }

  async findByClientId(clientId: string): Promise<ClientAccess[]> {
    return [...this.entries]
      .filter((key) => key.endsWith(`::${clientId}`))
      .map((key) =>
        ClientAccess.create({ userId: key.split('::')[0], clientId }),
      );
  }

  async revokeAllByClientId(clientId: string): Promise<void> {
    for (const key of this.entries) {
      if (key.endsWith(`::${clientId}`)) {
        this.entries.delete(key);
      }
    }
  }

  async countAllByClientId(): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    for (const key of this.entries) {
      const clientId = key.split('::')[1];
      counts.set(clientId, (counts.get(clientId) ?? 0) + 1);
    }
    return counts;
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

  async deleteExpiredBefore(date: Date): Promise<number> {
    let deleted = 0;
    for (const [key, code] of this.codes) {
      if (code.expiresAt.getTime() < date.getTime()) {
        this.codes.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  async markRedeemed(codeHash: string, now: Date): Promise<boolean> {
    // Check-and-set with no await in between: atomic on the event loop.
    const code = this.codes.get(codeHash);
    if (!code || code.used || code.expiresAt.getTime() < now.getTime()) {
      return false;
    }
    this.codes.set(codeHash, code.redeem(now));
    return true;
  }

  async markReused(codeHash: string, at: Date): Promise<void> {
    const code = this.codes.get(codeHash);
    if (!code || code.reusedAt) {
      return;
    }
    this.codes.set(
      codeHash,
      AuthorizationCode.fromPersistence({
        codeHash: code.codeHash,
        userId: code.userId,
        clientId: code.clientId,
        redirectUri: code.redirectUri,
        expiresAt: code.expiresAt,
        used: code.used,
        codeChallenge: code.codeChallenge,
        reusedAt: at,
      }),
    );
  }
}

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  private readonly tokens = new Map<string, RefreshToken>();

  async save(token: RefreshToken): Promise<void> {
    this.tokens.set(token.id, token);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return (
      [...this.tokens.values()].find(
        (token) => token.tokenHash === tokenHash,
      ) ?? null
    );
  }

  async findAllForUser(userId: string): Promise<RefreshToken[]> {
    return [...this.tokens.values()].filter((token) => token.userId === userId);
  }

  async deleteById(id: string): Promise<void> {
    this.tokens.delete(id);
  }

  private with(
    token: RefreshToken,
    changes: Partial<Pick<RefreshTokenProps, 'rotatedAt' | 'graceUsedAt'>>,
  ): RefreshToken {
    return RefreshToken.fromPersistence({
      id: token.id,
      tokenHash: token.tokenHash,
      userId: token.userId,
      clientId: token.clientId,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
      familyId: token.familyId,
      rotatedAt: token.rotatedAt,
      graceUsedAt: token.graceUsedAt,
      ...changes,
    });
  }

  async markRotated(id: string, at: Date): Promise<boolean> {
    const token = this.tokens.get(id);
    if (!token || token.rotatedAt) {
      return false;
    }
    this.tokens.set(id, this.with(token, { rotatedAt: at }));
    return true;
  }

  async claimGrace(id: string, at: Date): Promise<boolean> {
    // Check-and-set with no await in between: atomic on the event loop.
    const token = this.tokens.get(id);
    if (!token?.rotatedAt || token.graceUsedAt) {
      return false;
    }
    this.tokens.set(id, this.with(token, { graceUsedAt: at }));
    return true;
  }

  async deleteRotatedBefore(date: Date): Promise<number> {
    let deleted = 0;
    for (const [key, token] of this.tokens) {
      if (token.rotatedAt && token.rotatedAt.getTime() < date.getTime()) {
        this.tokens.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  async deleteFamily(familyId: string): Promise<number> {
    let deleted = 0;
    for (const [key, token] of this.tokens) {
      if (token.familyId === familyId) {
        this.tokens.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const token of this.tokens.values()) {
      if (token.userId === userId) {
        this.tokens.delete(token.id);
      }
    }
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    let deleted = 0;
    for (const [key, token] of this.tokens) {
      if (token.expiresAt.getTime() < date.getTime()) {
        this.tokens.delete(key);
        deleted += 1;
      }
    }
    return deleted;
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

  async countIssuedSince(email: string, since: Date): Promise<number> {
    return [...this.tokens.values()].filter(
      (token) =>
        token.email === email && token.issuedAt.getTime() >= since.getTime(),
    ).length;
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    let deleted = 0;
    for (const [key, token] of this.tokens) {
      if (token.expiresAt.getTime() < date.getTime()) {
        this.tokens.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  async markConsumed(tokenHash: string, now: Date): Promise<boolean> {
    // Check-and-set with no await in between: atomic on the event loop.
    const token = this.tokens.get(tokenHash);
    if (!token || token.isConsumed() || token.isExpired(now)) {
      return false;
    }
    this.tokens.set(tokenHash, token.consume(now));
    return true;
  }
}

export class FakeEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class FakeTokenService extends TokenService {
  async signAccessToken(
    payload: AccessTokenPayload,
    ttlSeconds: number = ACCESS_TOKEN_TTL,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      ...payload,
      iat: now,
      exp: now + ttlSeconds,
    };
    return JSON.stringify(claims);
  }

  async verifyAccessToken(
    token: string,
    audience?: string,
  ): Promise<AccessTokenClaims | null> {
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
  async sign(userId: string, sessionVersion: number): Promise<string> {
    return `session:${userId}:${sessionVersion.toString()}`;
  }

  /** `session:<userId>` (no version) stands for a legacy token issued before the sv claim. */
  async verify(token: string): Promise<VerifiedSession | null> {
    if (!token.startsWith('session:')) {
      return null;
    }
    const parts = token.slice('session:'.length).split(':');
    if (parts.length < 2) {
      return null;
    }
    return { userId: parts[0], sessionVersion: Number(parts[1]) };
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

  getOrThrow(key: string): string {
    const value = this.values[key] as string | undefined;
    if (value === undefined) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }
    return value;
  }
}

export class FakeFeatureFlags extends FeatureFlags {
  readonly values = new Map<string, boolean>();
  readonly asked: string[] = [];

  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    this.asked.push(key);
    return this.values.get(key) ?? codeDefault;
  }
}

export class FakeTelemetry extends Telemetry {
  readonly captured: { event: TelemetryEvent; userId?: string }[] = [];

  capture(event: TelemetryEvent, userId?: string): void {
    this.captured.push({ event, userId });
  }

  names(): string[] {
    return this.captured.map(({ event }) => event.name);
  }
}
