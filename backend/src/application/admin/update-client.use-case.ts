import { Injectable, NotFoundException } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';

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

    const updated = client.update(input);
    await this.clientRepository.save(updated);
    return updated;
  }
}
