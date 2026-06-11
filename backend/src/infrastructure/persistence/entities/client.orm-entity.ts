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

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;
}
