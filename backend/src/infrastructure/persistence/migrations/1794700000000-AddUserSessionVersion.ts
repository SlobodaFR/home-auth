import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * users.session_version: bumped to invalidate every SSO session of a user. Added with a constant
 * default, so existing rows read 0 and no backfill is needed. Nothing reads it yet (PC9, step D1).
 * SQLite has no ADD COLUMN IF NOT EXISTS, hence the hasColumn guard (idempotent on a re-run).
 */
export class AddUserSessionVersion1794700000000 implements MigrationInterface {
  name = 'AddUserSessionVersion1794700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'session_version')) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "session_version" integer NOT NULL DEFAULT (0)`,
    );
  }

  async down(): Promise<void> {
    // Forward-only: dropping a column is not worth the risk on production data.
  }
}
