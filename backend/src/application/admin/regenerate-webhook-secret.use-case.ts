import { randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientRepository } from '../../domain/client/client.repository';

@Injectable()
export class RegenerateWebhookSecretUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  /** Returns the new secret in clear: this is the only time it is ever shown (PC8). */
  async execute(clientId: string): Promise<{ webhookSecret: string }> {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    const webhookSecret = randomBytes(32).toString('hex');
    await this.clientRepository.save(
      client.regenerateWebhookSecret(webhookSecret, new Date()),
    );
    return { webhookSecret };
  }
}
