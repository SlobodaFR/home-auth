import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index({ unique: true })
  @Column('text')
  email!: string;

  @Column('text')
  name!: string;

  @Column({ type: 'text', name: 'avatar_key', nullable: true })
  avatarKey!: string | null;

  @Column({ type: 'boolean', name: 'is_admin', default: false })
  isAdmin!: boolean;

  @Column({ type: 'text', name: 'country_code', nullable: true })
  countryCode!: string | null;

  @Column({ type: 'text', nullable: true })
  locale!: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;
}
