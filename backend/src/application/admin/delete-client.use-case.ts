import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientRepository } from '../../domain/client/client.repository';
import { ClientAccessRepository } from '../../domain/client-access/client-access.repository';

@Injectable()
export class DeleteClientUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientAccessRepository: ClientAccessRepository,
  ) {}

  async execute(clientId: string): Promise<void> {
    if (!(await this.clientRepository.findById(clientId))) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    // Grants are keyed by client id only: a client re-created with this id must start with none.
    // Revoked first so that a failure leaves the client in place for a retry, never live grants.
    await this.clientAccessRepository.revokeAllByClientId(clientId);
    await this.clientRepository.delete(clientId);
  }
}
