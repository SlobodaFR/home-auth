import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthorizationCode } from '../../../domain/auth/authorization-code';
import { AuthorizationCodeRepository } from '../../../domain/auth/authorization-code.repository';
import { AuthorizationCodeOrmEntity } from '../entities/authorization-code.orm-entity';

@Injectable()
export class TypeOrmAuthorizationCodeRepository extends AuthorizationCodeRepository {
  constructor(
    @InjectRepository(AuthorizationCodeOrmEntity)
    private readonly repository: Repository<AuthorizationCodeOrmEntity>,
  ) {
    super();
  }

  async save(code: AuthorizationCode): Promise<void> {
    await this.repository.save({
      codeHash: code.codeHash,
      userId: code.userId,
      clientId: code.clientId,
      redirectUri: code.redirectUri,
      expiresAt: code.expiresAt,
      used: code.used,
    });
  }

  async findByCodeHash(codeHash: string): Promise<AuthorizationCode | null> {
    const row = await this.repository.findOne({ where: { codeHash } });
    return row ? AuthorizationCode.fromPersistence(row) : null;
  }
}
