import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MagicLinkToken } from '../../../domain/auth/magic-link-token';
import { MagicLinkTokenRepository } from '../../../domain/auth/magic-link-token.repository';
import { MagicLinkTokenOrmEntity } from '../entities/magic-link-token.orm-entity';

@Injectable()
export class TypeOrmMagicLinkTokenRepository extends MagicLinkTokenRepository {
  constructor(
    @InjectRepository(MagicLinkTokenOrmEntity)
    private readonly repository: Repository<MagicLinkTokenOrmEntity>,
  ) {
    super();
  }

  async save(token: MagicLinkToken): Promise<void> {
    await this.repository.save({
      id: token.id,
      email: token.email,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const row = await this.repository.findOne({ where: { tokenHash } });
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: MagicLinkTokenOrmEntity): MagicLinkToken {
    return MagicLinkToken.fromPersistence({
      id: row.id,
      email: row.email,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    });
  }
}
