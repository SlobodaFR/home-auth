import { randomBytes } from 'crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';
import { hashSecret } from '../../domain/shared/hash';

export interface CreateClientInput {
  id: string;
  name: string;
  redirectUris: string[];
  logoutWebhookUrl: string | null;
}

export interface CreateClientResult {
  client: Client;
  clientSecret: string;
}

@Injectable()
export class CreateClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(input: CreateClientInput): Promise<CreateClientResult> {
    if (await this.clientRepository.findById(input.id)) {
      throw new ConflictException(`Client ${input.id} already exists`);
    }

    const clientSecret = randomBytes(32).toString('hex');
    const client = Client.create({
      id: input.id,
      name: input.name,
      clientSecretHash: hashSecret(clientSecret),
      redirectUris: input.redirectUris,
      logoutWebhookUrl: input.logoutWebhookUrl,
      createdAt: new Date(),
    });
    await this.clientRepository.save(client);

    return { client, clientSecret };
  }
}
