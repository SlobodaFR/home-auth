import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../../domain/client/client';
import { ClientRepository } from '../../../domain/client/client.repository';
import { ClientOrmEntity } from '../entities/client.orm-entity';

@Injectable()
export class TypeOrmClientRepository extends ClientRepository {
  constructor(
    @InjectRepository(ClientOrmEntity)
    private readonly repository: Repository<ClientOrmEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<Client | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findAll(): Promise<Client[]> {
    const rows = await this.repository.find({ order: { createdAt: 'ASC' } });
    return rows.map(toDomain);
  }

  async save(client: Client): Promise<void> {
    await this.repository.save({
      id: client.id,
      name: client.name,
      clientSecretHash: client.clientSecretHash,
      redirectUris: [...client.redirectUris],
      logoutWebhookUrl: client.logoutWebhookUrl,
      createdAt: client.createdAt,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}

function toDomain(row: ClientOrmEntity): Client {
  return Client.create({
    id: row.id,
    name: row.name,
    clientSecretHash: row.clientSecretHash,
    redirectUris: row.redirectUris,
    logoutWebhookUrl: row.logoutWebhookUrl,
    createdAt: row.createdAt,
  });
}
