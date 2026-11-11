import { randomBytes, randomUUID } from 'crypto';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import {
  ACCESS_TOKEN_TTL,
  TokenService,
} from '../../domain/auth/token.service';
import { ClientRepository } from '../../domain/client/client.repository';
import { hashToken, verifySecret } from '../../domain/shared/hash';
import { Telemetry } from '../../domain/shared/telemetry';
import { UserRepository } from '../../domain/user/user.repository';

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
  ) {}

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
    let redeemed;
    try {
      // Domain rules give the error message (used, expired)...
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
      throw new UnauthorizedException('Authorization code already used');
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
