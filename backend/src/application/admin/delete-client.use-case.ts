import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientRepository } from '../../domain/client/client.repository';

@Injectable()
export class DeleteClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(clientId: string): Promise<void> {
    if (!(await this.clientRepository.findById(clientId))) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    await this.clientRepository.delete(clientId);
  }
}
