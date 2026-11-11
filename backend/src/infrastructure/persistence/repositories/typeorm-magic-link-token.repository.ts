import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  MAGIC_LINK_TOKEN_TTL_MS,
  MagicLinkToken,
} from '../../../domain/auth/magic-link-token';
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

  async countIssuedSince(email: string, since: Date): Promise<number> {
    // Only expires_at is persisted; issuedAt = expiresAt - TTL.
    return this.repository.count({
      where: {
        email,
        expiresAt: MoreThanOrEqual(
          new Date(since.getTime() + MAGIC_LINK_TOKEN_TTL_MS),
        ),
      },
    });
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    const result = await this.repository.delete({ expiresAt: LessThan(date) });
    return result.affected ?? 0;
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
