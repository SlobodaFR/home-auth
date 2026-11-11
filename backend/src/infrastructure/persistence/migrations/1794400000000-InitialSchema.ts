import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema as created by `synchronize: true` until now. IF NOT EXISTS everywhere: on the existing
 * production database this migration changes nothing and only records itself; on an empty
 * database it creates the schema.
 */
export class InitialSchema1794400000000 implements MigrationInterface {
  name = 'InitialSchema1794400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "authorization_codes" ("code_hash" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "client_id" text NOT NULL, "redirect_uri" text NOT NULL, "expires_at" datetime NOT NULL, "used" boolean NOT NULL, "code_challenge" text)`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "client_access" ("user_id" text NOT NULL, "client_id" text NOT NULL, PRIMARY KEY ("user_id", "client_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "clients" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "client_secret_hash" text NOT NULL, "redirect_uris" text NOT NULL, "logout_webhook_url" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "magic_link_tokens" ("id" text PRIMARY KEY NOT NULL, "email" text NOT NULL, "token_hash" text NOT NULL, "expires_at" datetime NOT NULL, "consumed_at" datetime)`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "refresh_tokens" ("id" text PRIMARY KEY NOT NULL, "token_hash" text NOT NULL, "user_id" text NOT NULL, "client_id" text NOT NULL, "expires_at" datetime NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" ("id" text PRIMARY KEY NOT NULL, "email" text NOT NULL, "name" text NOT NULL, "avatar_key" text, "is_admin" boolean NOT NULL DEFAULT (0), "country_code" text, "locale" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_add60707d7cfe2cd4fe2bd9bb2" ON "magic_link_tokens" ("token_hash")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "authorization_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "client_access"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "magic_link_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
