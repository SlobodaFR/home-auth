import { randomBytes, randomUUID } from 'crypto';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationCode } from '../../domain/auth/authorization-code';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
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
import { REUSE_REVOCATION_FLAG } from './token-reuse';

export interface ExchangeCodeInput {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** PKCE verifier, required when /authorize received a challenge. */
  codeVerifier?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class ExchangeCodeUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly authorizationCodeRepository: AuthorizationCodeRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    private readonly telemetry: Telemetry,
    private readonly featureFlags: FeatureFlags,
  ) {}

  /**
   * A code presented twice (PC2): its refresh token family (named after the code hash) is deleted
   * when the flag is on, since the first redemption may have been an attacker's.
   */
  private async rejectReuse(
    clientId: string,
    code: AuthorizationCode,
  ): Promise<never> {
    if (await this.featureFlags.isEnabled(REUSE_REVOCATION_FLAG, false)) {
      await this.refreshTokenRepository.deleteFamily(code.codeHash);
    }
    this.telemetry.capture(
      { name: 'code_reused', properties: { client_id: clientId } },
      code.userId,
    );
    throw new UnauthorizedException('Authorization code already used');
  }

  async execute(input: ExchangeCodeInput): Promise<TokenPair> {
    const client = await this.clientRepository.findById(input.clientId);
    // Always verify, even for an unknown client, so timing does not reveal existing client ids.
    const secretOk = await verifySecret(
      input.clientSecret,
      client?.clientSecretHash ?? null,
    );
    if (!client || !secretOk) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const authorizationCode =
      await this.authorizationCodeRepository.findByCodeHash(
        hashToken(input.code),
      );
    if (
      authorizationCode?.clientId !== input.clientId ||
      authorizationCode.redirectUri !== input.redirectUri
    ) {
      throw new UnauthorizedException('Invalid authorization code');
    }

    // PKCE before redeeming: a request without the right verifier must not burn the code.
    if (!authorizationCode.matchesVerifier(input.codeVerifier)) {
      throw new UnauthorizedException('Invalid authorization code');
    }

    const now = new Date();
    if (authorizationCode.used) {
      return this.rejectReuse(client.id, authorizationCode);
    }
    let redeemed;
    try {
      // Domain rules give the error message (expired)...
      redeemed = authorizationCode.redeem(now);
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Invalid authorization code',
      );
    }
    // ...but only the atomic update decides, so concurrent requests cannot both redeem.
    if (
      !(await this.authorizationCodeRepository.markRedeemed(
        redeemed.codeHash,
        now,
      ))
    ) {
      return this.rejectReuse(client.id, authorizationCode);
    }

    const user = await this.userRepository.findById(redeemed.userId);
    if (!user) {
      throw new NotFoundException(`User ${redeemed.userId} not found`);
    }

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      aud: client.id,
    });

    const rawRefreshToken = randomBytes(32).toString('hex');
    await this.refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: hashToken(rawRefreshToken),
        userId: user.id,
        clientId: client.id,
        createdAt: new Date(),
        // One family per login: a replayed code can revoke what it issued (PC2).
        familyId: redeemed.codeHash,
      }),
    );

    this.telemetry.capture(
      {
        name: 'token_exchanged',
        properties: { client_id: client.id, grant_type: 'authorization_code' },
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
