import { randomBytes, randomUUID } from 'crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { ACCESS_TOKEN_TTL, TokenService } from '../../domain/auth/token.service';
import { ClientRepository } from '../../domain/client/client.repository';
import { hashToken, verifySecret } from '../../domain/shared/hash';
import { UserRepository } from '../../domain/user/user.repository';
import { TokenPair } from './exchange-code.use-case';

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
  ) {}

  async execute(input: RefreshTokenInput): Promise<TokenPair> {
    const client = await this.clientRepository.findById(input.clientId);
    if (!client || !verifySecret(input.clientSecret, client.clientSecretHash)) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const existing = await this.refreshTokenRepository.findByTokenHash(hashToken(input.refreshToken));
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

    // Rotate: delete the old refresh token and issue a new one.
    await this.refreshTokenRepository.deleteById(existing.id);

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

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      aud: client.id,
    });

    return { accessToken, refreshToken: rawRefreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TOKEN_TTL };
  }
}
