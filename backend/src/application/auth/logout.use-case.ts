import { Injectable, Logger } from '@nestjs/common';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { ClientRepository } from '../../domain/client/client.repository';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';
import { UserRepository } from '../../domain/user/user.repository';

@Injectable()
export class LogoutUseCase {
  private readonly logger = new Logger(LogoutUseCase.name);

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly clientRepository: ClientRepository,
    private readonly webhookNotifier: WebhookNotifier,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    // Kills every SSO session cookie of the user, on all devices (PC9).
    await this.userRepository.revokeSessions(userId);

    const tokens = await this.refreshTokenRepository.findAllForUser(userId);
    const clientIds = [...new Set(tokens.map((token) => token.clientId))];

    await this.refreshTokenRepository.deleteAllForUser(userId);

    const clients = await Promise.all(
      clientIds.map((clientId) => this.clientRepository.findById(clientId)),
    );

    // Never block the logout on client apps (CLAUDE.md): all webhooks start at once and the
    // response does not wait for them. Each failure is logged by client, without the user id.
    for (const client of clients) {
      if (!client?.logoutWebhookUrl) {
        continue;
      }
      let delivery: Promise<void>;
      try {
        delivery = this.webhookNotifier.notify(
          client.logoutWebhookUrl,
          { userId },
          client.activeWebhookSecrets(new Date()),
        );
      } catch (error: unknown) {
        delivery = Promise.reject(
          error instanceof Error ? error : new Error('unknown error'),
        );
      }
      delivery.catch((error: unknown) => {
        this.logger.warn(
          `Logout webhook for client ${client.id} failed: ${String(error)}`,
        );
      });
    }
  }
}
