import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'magic_link_tokens' })
export class MagicLinkTokenOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  email!: string;

  @Index({ unique: true })
  @Column({ type: 'text', name: 'token_hash' })
  tokenHash!: string;

  @Column({ type: 'datetime', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'datetime', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null;
}
