import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'clients' })
export class ClientOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @Column({ type: 'text', name: 'client_secret_hash' })
  clientSecretHash!: string;

  @Column({ type: 'simple-json', name: 'redirect_uris' })
  redirectUris!: string[];

  @Column({ type: 'text', name: 'logout_webhook_url', nullable: true })
  logoutWebhookUrl!: string | null;

  @Column({ type: 'text', name: 'webhook_secret', nullable: true })
  webhookSecret!: string | null;

  @Column({ type: 'text', name: 'webhook_secret_previous', nullable: true })
  webhookSecretPrevious!: string | null;

  @Column({
    type: 'datetime',
    name: 'webhook_secret_previous_expires_at',
    nullable: true,
  })
  webhookSecretPreviousExpiresAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;
}
