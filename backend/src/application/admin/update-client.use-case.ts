import { Injectable, NotFoundException } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';
import { ensureSecureWebhookUrl } from './ensure-secure-webhook-url';

export interface UpdateClientInput {
  name?: string;
  redirectUris?: string[];
  logoutWebhookUrl?: string | null;
}

@Injectable()
export class UpdateClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(clientId: string, input: UpdateClientInput): Promise<Client> {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    // Only a modified webhook is checked: an existing http client stays editable until its
    // webhook is touched (the admin form resends the unchanged value).
    if (
      input.logoutWebhookUrl &&
      input.logoutWebhookUrl !== client.logoutWebhookUrl
    ) {
      ensureSecureWebhookUrl(input.logoutWebhookUrl);
    }

    const updated = client.update(input);
    await this.clientRepository.save(updated);
    return updated;
  }
}
