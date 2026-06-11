import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'client_access' })
export class ClientAccessOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ type: 'text', name: 'client_id' })
  clientId!: string;
}
