import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../../../domain/auth/refresh-token';
import { RefreshTokenRepository } from '../../../domain/auth/refresh-token.repository';
import { RefreshTokenOrmEntity } from '../entities/refresh-token.orm-entity';

@Injectable()
export class TypeOrmRefreshTokenRepository extends RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenOrmEntity)
    private readonly repository: Repository<RefreshTokenOrmEntity>,
  ) {
    super();
  }

  async save(token: RefreshToken): Promise<void> {
    await this.repository.save({
      id: token.id,
      tokenHash: token.tokenHash,
      userId: token.userId,
      clientId: token.clientId,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.repository.findOne({ where: { tokenHash } });
    return row ? this.toDomain(row) : null;
  }

  async findAllForUser(userId: string): Promise<RefreshToken[]> {
    const rows = await this.repository.find({ where: { userId } });
    return rows.map((row) => this.toDomain(row));
  }

  async deleteById(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }

  private toDomain(row: RefreshTokenOrmEntity): RefreshToken {
    return RefreshToken.fromPersistence({
      id: row.id,
      tokenHash: row.tokenHash,
      userId: row.userId,
      clientId: row.clientId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  }
}
