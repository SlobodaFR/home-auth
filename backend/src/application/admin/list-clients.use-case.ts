import { Injectable } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';
import { ClientAccessRepository } from '../../domain/client-access/client-access.repository';

export interface ClientSummary {
  client: Client;
  allowedUserCount: number;
}

@Injectable()
export class ListClientsUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientAccessRepository: ClientAccessRepository,
  ) {}

  async execute(): Promise<ClientSummary[]> {
    const [clients, counts] = await Promise.all([
      this.clientRepository.findAll(),
      this.clientAccessRepository.countAllByClientId(),
    ]);
    return clients.map((client) => ({
      client,
      allowedUserCount: counts.get(client.id) ?? 0,
    }));
  }
}
