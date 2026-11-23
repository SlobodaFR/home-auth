import { randomBytes, randomUUID } from 'crypto';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import {
  ACCESS_TOKEN_TTL,
  TokenService,
} from '../../domain/auth/token.service';
import { ClientRepository } from '../../domain/client/client.repository';
import { hashToken, verifySecret } from '../../domain/shared/hash';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { Telemetry } from '../../domain/shared/telemetry';
import { UserRepository } from '../../domain/user/user.repository';
import { TokenPair } from './exchange-code.use-case';
import { REFRESH_GRACE_MS, REUSE_REVOCATION_FLAG } from './token-reuse';

export interface RefreshTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    private readonly telemetry: Telemetry,
    private readonly featureFlags: FeatureFlags,
  ) {}

  private reportReuse(
    clientId: string,
    userId: string,
    kind: 'rotated_in_grace' | 'concurrent_lost_race' | 'rotated_after_grace',
    revoked: boolean,
  ): void {
    this.telemetry.capture(
      {
        name: 'refresh_reused',
        properties: { client_id: clientId, kind, revoked },
      },
      userId,
    );
  }

  async execute(input: RefreshTokenInput): Promise<TokenPair> {
    const client = await this.clientRepository.findById(input.clientId);
    // Always verify, even for an unknown client, so timing does not reveal existing client ids.
    const secretOk = await verifySecret(
      input.clientSecret,
      client?.clientSecretHash ?? null,
    );
    if (!client || !secretOk) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const existing = await this.refreshTokenRepository.findByTokenHash(
      hashToken(input.refreshToken),
    );
    if (existing?.clientId !== input.clientId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.isExpired()) {
      await this.refreshTokenRepository.deleteById(existing.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.userRepository.findById(existing.userId);
    if (!user) {
      throw new NotFoundException(`User ${existing.userId} not found`);
    }

    // Rotate: the presented token is kept, marked rotated, so a later presentation is a reuse.
    // Only the atomic update decides who rotated it (PC1).
    const now = new Date();
    let reuse: {
      rotatedAt: Date;
      kind: 'rotated_in_grace' | 'concurrent_lost_race';
    } | null = null;
    if (existing.rotatedAt !== null) {
      reuse = { rotatedAt: existing.rotatedAt, kind: 'rotated_in_grace' };
    } else if (
      !(await this.refreshTokenRepository.markRotated(existing.id, now))
    ) {
      // Lost to a concurrent rotation, or deleted meanwhile (logout, revoked family, purge):
      // a deleted token must not come back as a new pair.
      const current = await this.refreshTokenRepository.findByTokenHash(
        existing.tokenHash,
      );
      if (!current?.rotatedAt) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      reuse = { rotatedAt: current.rotatedAt, kind: 'concurrent_lost_race' };
    }

    if (reuse) {
      if (now.getTime() - reuse.rotatedAt.getTime() > REFRESH_GRACE_MS) {
        const revoke = await this.featureFlags.isEnabled(
          REUSE_REVOCATION_FLAG,
          false,
        );
        if (revoke) {
          await this.refreshTokenRepository.deleteFamily(existing.familyId);
        }
        this.reportReuse(client.id, user.id, 'rotated_after_grace', revoke);
        throw new UnauthorizedException('Invalid refresh token');
      }
      // Within 30 s (client lost the new pair, concurrent requests): same family, new pair.
      this.reportReuse(client.id, user.id, reuse.kind, false);
    }

    const rawRefreshToken = randomBytes(32).toString('hex');
    await this.refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: hashToken(rawRefreshToken),
        userId: user.id,
        clientId: client.id,
        createdAt: now,
        familyId: existing.familyId,
      }),
    );

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      aud: client.id,
    });

    this.telemetry.capture(
      {
        name: 'token_exchanged',
        properties: { client_id: client.id, grant_type: 'refresh_token' },
      },
      user.id,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL,
    };
  }
}
