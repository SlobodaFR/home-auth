import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import { SessionService } from '../../domain/auth/session.service';
import { hashToken } from '../../domain/shared/hash';
import { Telemetry } from '../../domain/shared/telemetry';
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
    private readonly telemetry: Telemetry,
  ) {}

  async execute(rawToken: string): Promise<VerifyMagicLinkResult> {
    const tokenHash = hashToken(rawToken);
    const magicLinkToken =
      await this.magicLinkTokenRepository.findByTokenHash(tokenHash);
    if (!magicLinkToken) {
      this.telemetry.capture({
        name: 'magic_link_failed',
        properties: { reason: 'invalid' },
      });
      throw new UnauthorizedException('Lien de connexion invalide');
    }

    const now = new Date();
    let consumed;
    try {
      // Domain rules give the reason (used, expired)...
      consumed = magicLinkToken.consume(now);
    } catch (error) {
      this.telemetry.capture({
        name: 'magic_link_failed',
        properties: {
          reason: magicLinkToken.isConsumed() ? 'used' : 'expired',
        },
      });
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Lien de connexion invalide',
      );
    }
    // ...but only the atomic update decides, so concurrent clicks cannot both open a session.
    if (
      !(await this.magicLinkTokenRepository.markConsumed(
        consumed.tokenHash,
        now,
      ))
    ) {
      this.telemetry.capture({
        name: 'magic_link_failed',
        properties: { reason: 'used' },
      });
      throw new UnauthorizedException('Magic link already used');
    }

    const user = await this.userRepository.findByEmail(consumed.email);
    if (!user) {
      this.telemetry.capture({
        name: 'magic_link_failed',
        properties: { reason: 'invalid' },
      });
      throw new NotFoundException('User not found');
    }

    const sessionToken = await this.sessionService.sign(user.id);
    this.telemetry.capture(
      { name: 'login_succeeded', properties: { method: 'magic_link' } },
      user.id,
    );

    return { sessionToken, userId: user.id };
  }
}
