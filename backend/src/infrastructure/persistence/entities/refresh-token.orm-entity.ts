import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

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
}
