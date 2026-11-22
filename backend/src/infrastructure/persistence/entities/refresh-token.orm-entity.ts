import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'refresh_tokens' })
export class RefreshTokenOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'text', name: 'token_hash' })
  tokenHash!: string;

  @Column({ type: 'text', name: 'user_id' })
  userId!: string;

  @Column({ type: 'text', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'datetime', name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  /** Null only for rows written before the column existed (backfilled with id). */
  @Index('IDX_refresh_tokens_family_id')
  @Column({ type: 'text', name: 'family_id', nullable: true })
  familyId!: string | null;

  @Column({ type: 'datetime', name: 'rotated_at', nullable: true })
  rotatedAt!: Date | null;

  /** Set when the single grace re-issue of this rotated token was spent (PC1, amended). */
  @Column({ type: 'datetime', name: 'grace_used_at', nullable: true })
  graceUsedAt!: Date | null;
}
