import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientRepository } from '../../domain/client/client.repository';
import { ClientAccess } from '../../domain/client-access/client-access';
import { ClientAccessRepository } from '../../domain/client-access/client-access.repository';
import { UserRepository } from '../../domain/user/user.repository';

@Injectable()
export class GrantClientAccessUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly userRepository: UserRepository,
    private readonly clientAccessRepository: ClientAccessRepository,
  ) {}

  async execute(clientId: string, userId: string): Promise<void> {
    if (!(await this.clientRepository.findById(clientId))) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    if (!(await this.userRepository.findById(userId))) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    await this.clientAccessRepository.grant(ClientAccess.create({ userId, clientId }));
  }
}

@Injectable()
export class RevokeClientAccessUseCase {
  constructor(private readonly clientAccessRepository: ClientAccessRepository) {}

  async execute(clientId: string, userId: string): Promise<void> {
    await this.clientAccessRepository.revoke(userId, clientId);
  }
}

@Injectable()
export class ListClientAccessUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientAccessRepository: ClientAccessRepository,
  ) {}

  async execute(clientId: string): Promise<string[]> {
    if (!(await this.clientRepository.findById(clientId))) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    const entries = await this.clientAccessRepository.findByClientId(clientId);
    return entries.map((entry) => entry.userId);
  }
}
