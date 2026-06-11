import { randomBytes, randomUUID } from 'crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { ACCESS_TOKEN_TTL, TokenService } from '../../domain/auth/token.service';
import { ClientRepository } from '../../domain/client/client.repository';
import { hashToken, verifySecret } from '../../domain/shared/hash';
import { UserRepository } from '../../domain/user/user.repository';

export interface ExchangeCodeInput {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
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
  ) {}

  async execute(input: ExchangeCodeInput): Promise<TokenPair> {
    const client = await this.clientRepository.findById(input.clientId);
    if (!client || !verifySecret(input.clientSecret, client.clientSecretHash)) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const authorizationCode = await this.authorizationCodeRepository.findByCodeHash(hashToken(input.code));
    if (
      authorizationCode?.clientId !== input.clientId ||
      authorizationCode.redirectUri !== input.redirectUri
    ) {
      throw new UnauthorizedException('Invalid authorization code');
    }

    let redeemed;
    try {
      redeemed = authorizationCode.redeem();
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Invalid authorization code');
    }
    await this.authorizationCodeRepository.save(redeemed);

    const user = await this.userRepository.findById(redeemed.userId);
    if (!user) {
      throw new NotFoundException(`User ${redeemed.userId} not found`);
    }

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
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

    return { accessToken, refreshToken: rawRefreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TOKEN_TTL };
  }
}
