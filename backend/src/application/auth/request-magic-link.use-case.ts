import { randomBytes, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagicLinkToken } from '../../domain/auth/magic-link-token';
import { MagicLinkTokenRepository } from '../../domain/auth/magic-link-token.repository';
import { EmailMessage, EmailSender } from '../../domain/shared/email-sender';
import { hashToken } from '../../domain/shared/hash';
import { pseudonymize } from '../../domain/shared/pseudonymize';
import { Telemetry } from '../../domain/shared/telemetry';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';
import { buildMagicLinkEmailHtml } from '../../infrastructure/email/templates/magic-link-email.template';

/**
 * Per-email cap on sent links. It protects the user's mailbox and the email
 * quota; abuse from a single source is handled by the HTTP rate limit. Over
 * budget the request is silently ignored (same 204 as an unknown email), so an
 * attacker cannot turn it into a visible lockout of the victim.
 */
const MAX_LINKS_PER_EMAIL = 10;
const LINK_BUDGET_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class RequestMagicLinkUseCase {
  private readonly logger = new Logger(RequestMagicLinkUseCase.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly magicLinkTokenRepository: MagicLinkTokenRepository,
    private readonly emailSender: EmailSender,
    private readonly config: ConfigService,
    private readonly telemetry: Telemetry,
  ) {}

  async execute(rawEmail: string, redirect?: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();

    let user = await this.userRepository.findByEmail(email);
    if (!user) {
      user = await this.bootstrapAdminIfEligible(email);
      if (!user) {
        this.telemetry.capture({
          name: 'magic_link_requested',
          properties: { outcome: 'unknown' },
        });
        const pid = pseudonymize(
          email,
          this.config.getOrThrow<string>('PSEUDONYM_SECRET'),
        );
        this.logger.log(
          `Magic link requested for unknown email (pid=${pid}); ignoring (no self-signup)`,
        );
        return;
      }
    }

    const windowStart = new Date(Date.now() - LINK_BUDGET_WINDOW_MS);
    if (
      (await this.magicLinkTokenRepository.countIssuedSince(
        user.email,
        windowStart,
      )) >= MAX_LINKS_PER_EMAIL
    ) {
      this.logger.warn(
        'Magic link budget exhausted for a user; ignoring request',
      );
      this.telemetry.capture(
        {
          name: 'magic_link_requested',
          properties: { outcome: 'budget_exhausted' },
        },
        user.id,
      );
      return;
    }

    this.telemetry.capture(
      { name: 'magic_link_requested', properties: { outcome: 'sent' } },
      user.id,
    );

    const rawToken = randomBytes(32).toString('hex');
    const magicLinkToken = MagicLinkToken.issue({
      id: randomUUID(),
      email: user.email,
      tokenHash: hashToken(rawToken),
    });
    await this.magicLinkTokenRepository.save(magicLinkToken);

    const authBaseUrl = this.config.get<string>(
      'AUTH_BASE_URL',
      'http://localhost:3000',
    );
    let link = `${authBaseUrl.replace(/\/$/, '')}/auth/callback?token=${rawToken}`;
    if (redirect?.startsWith('/authorize?')) {
      link += `&redirect=${encodeURIComponent(redirect)}`;
    }

    // Fire-and-forget: waiting for delivery would make known emails answer measurably
    // slower than unknown ones, revealing which accounts exist (#24). A failed delivery is lost;
    // the user asks for a new link.
    this.deliverInBackground({
      to: user.email,
      subject: 'Votre lien de connexion',
      html: buildMagicLinkEmailHtml(link),
    });
  }

  /** Never throws and never rejects: even a sender failing before it returns a promise is contained. */
  private deliverInBackground(message: EmailMessage): void {
    let delivery: Promise<void>;
    try {
      delivery = this.emailSender.send(message);
    } catch (error: unknown) {
      delivery = Promise.reject(
        error instanceof Error ? error : new Error('unknown error'),
      );
    }
    delivery.catch((error: unknown) => {
      // Never the message: Resend errors can echo the address.
      this.logger.error(
        `Magic link email delivery failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
    });
  }

  private async bootstrapAdminIfEligible(email: string): Promise<User | null> {
    const adminEmail = this.config
      .get<string>('ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
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
