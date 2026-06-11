import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import { SessionService } from '../../domain/auth/session.service';
import { hashToken } from '../../domain/shared/hash';
import { UserRepository } from '../../domain/user/user.repository';

export interface VerifyMagicLinkResult {
  sessionToken: string;
  userId: string;
}

@Injectable()
export class VerifyMagicLinkUseCase {
  constructor(
    private readonly magicLinkTokenRepository: MagicLinkTokenRepository,
    private readonly userRepository: UserRepository,
    private readonly sessionService: SessionService,
  ) {}

  async execute(rawToken: string): Promise<VerifyMagicLinkResult> {
    const tokenHash = hashToken(rawToken);
    const magicLinkToken = await this.magicLinkTokenRepository.findByTokenHash(tokenHash);
    if (!magicLinkToken) {
      throw new UnauthorizedException('Lien de connexion invalide');
    }

    let consumed;
    try {
      consumed = magicLinkToken.consume();
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Lien de connexion invalide');
    }
    await this.magicLinkTokenRepository.save(consumed);

    const user = await this.userRepository.findByEmail(consumed.email);
    if (!user) {
      throw new NotFoundException(`User ${consumed.email} not found`);
    }

    const sessionToken = await this.sessionService.sign(user.id);

    return { sessionToken, userId: user.id };
  }
}
