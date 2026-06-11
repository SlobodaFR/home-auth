import { Injectable, Logger } from '@nestjs/common';
import { RefreshTokenRepository } from '../../domain/auth/refresh-token.repository';
import { ClientRepository } from '../../domain/client/client.repository';
import { WebhookNotifier } from '../../domain/shared/webhook-notifier';

@Injectable()
export class LogoutUseCase {
  private readonly logger = new Logger(LogoutUseCase.name);

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly clientRepository: ClientRepository,
    private readonly webhookNotifier: WebhookNotifier,
  ) {}

  async execute(userId: string): Promise<void> {
    const tokens = await this.refreshTokenRepository.findAllForUser(userId);
    const clientIds = [...new Set(tokens.map((token) => token.clientId))];

    await this.refreshTokenRepository.deleteAllForUser(userId);

    for (const clientId of clientIds) {
      const client = await this.clientRepository.findById(clientId);
      if (!client?.logoutWebhookUrl) {
        continue;
      }
      try {
        await this.webhookNotifier.notify(client.logoutWebhookUrl, { userId });
      } catch (error) {
        this.logger.warn(`Logout webhook for client ${clientId} failed: ${String(error)}`);
      }
    }
  }
}
