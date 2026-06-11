import { Injectable } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';

@Injectable()
export class ListClientsUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(): Promise<Client[]> {
    return this.clientRepository.findAll();
  }
}
