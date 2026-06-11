import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../domain/user/user';
import { UserRepository } from '../../../domain/user/user.repository';
import { UserOrmEntity } from '../entities/user.orm-entity';

@Injectable()
export class TypeOrmUserRepository extends UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.repository.findOne({ where: { email: email.trim().toLowerCase() } });
    return row ? toDomain(row) : null;
  }

  async findAll(): Promise<User[]> {
    const rows = await this.repository.find({ order: { createdAt: 'ASC' } });
    return rows.map(toDomain);
  }

  async save(user: User): Promise<void> {
    await this.repository.save({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarKey: user.avatarKey,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
    });
  }

  async count(): Promise<number> {
    return this.repository.count();
  }
}

function toDomain(row: UserOrmEntity): User {
  return User.create({
    id: row.id,
    email: row.email,
    name: row.name,
    avatarKey: row.avatarKey,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
  });
}
