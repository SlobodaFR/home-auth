import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientAccess } from '../../../domain/client-access/client-access';
import { ClientAccessRepository } from '../../../domain/client-access/client-access.repository';
import { ClientAccessOrmEntity } from '../entities/client-access.orm-entity';

@Injectable()
export class TypeOrmClientAccessRepository extends ClientAccessRepository {
  constructor(
    @InjectRepository(ClientAccessOrmEntity)
    private readonly repository: Repository<ClientAccessOrmEntity>,
  ) {
    super();
  }

  async exists(userId: string, clientId: string): Promise<boolean> {
    const count = await this.repository.count({ where: { userId, clientId } });
    return count > 0;
  }

  async grant(access: ClientAccess): Promise<void> {
    await this.repository.save({ userId: access.userId, clientId: access.clientId });
  }

  async revoke(userId: string, clientId: string): Promise<void> {
    await this.repository.delete({ userId, clientId });
  }

  async findByClientId(clientId: string): Promise<ClientAccess[]> {
    const rows = await this.repository.find({ where: { clientId } });
    return rows.map((row) => ClientAccess.create({ userId: row.userId, clientId: row.clientId }));
  }
}
