import { randomBytes, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import { EmailSender } from '../../domain/shared/email-sender';
import { hashToken } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';
import { buildMagicLinkEmailHtml } from '../../infrastructure/email/templates/magic-link-email.template';

@Injectable()
export class RequestMagicLinkUseCase {
  private readonly logger = new Logger(RequestMagicLinkUseCase.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly magicLinkTokenRepository: MagicLinkTokenRepository,
    private readonly emailSender: EmailSender,
    private readonly config: ConfigService,
  ) {}

  async execute(rawEmail: string, redirect?: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();

    let user = await this.userRepository.findByEmail(email);
    if (!user) {
      user = await this.bootstrapAdminIfEligible(email);
      if (!user) {
        this.logger.log(`Magic link requested for unknown email ${email}; ignoring (no self-signup)`);
        return;
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const magicLinkToken = MagicLinkToken.issue({
      id: randomUUID(),
      email: user.email,
      tokenHash: hashToken(rawToken),
    });
    await this.magicLinkTokenRepository.save(magicLinkToken);

    const authBaseUrl = this.config.get<string>('AUTH_BASE_URL', 'http://localhost:3000');
    let link = `${authBaseUrl.replace(/\/$/, '')}/auth/callback?token=${rawToken}`;
    if (redirect?.startsWith('/authorize?')) {
      link += `&redirect=${encodeURIComponent(redirect)}`;
    }

    await this.emailSender.send({
      to: user.email,
      subject: 'Votre lien de connexion',
      html: buildMagicLinkEmailHtml(link),
    });
  }

  private async bootstrapAdminIfEligible(email: string): Promise<User | null> {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    if (!adminEmail || email !== adminEmail) {
      return null;
    }
    if ((await this.userRepository.count()) > 0) {
      return null;
    }

    const admin = User.create({
      id: randomUUID(),
      email,
      name: email.split('@')[0] ?? email,
      avatarKey: null,
      isAdmin: true,
      createdAt: new Date(),
    });
    await this.userRepository.save(admin);
    return admin;
  }
}
