import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'authorization_codes' })
export class AuthorizationCodeOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'code_hash' })
  codeHash!: string;

  @Column({ type: 'text', name: 'user_id' })
  userId!: string;

  @Column({ type: 'text', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'text', name: 'redirect_uri' })
  redirectUri!: string;

  @Column({ type: 'datetime', name: 'expires_at' })
  expiresAt!: Date;

  @Column('boolean')
  used!: boolean;
}
