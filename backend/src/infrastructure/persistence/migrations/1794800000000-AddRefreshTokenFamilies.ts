import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * refresh_tokens.family_id and rotated_at (PC1/PC2, step A2). Nullable columns: existing rows
 * become their own family (family_id = id) and are not rotated. Nothing changes behaviour yet.
 * SQLite has no ADD COLUMN IF NOT EXISTS, hence the hasColumn guards (idempotent on a re-run).
 */
export class AddRefreshTokenFamilies1794800000000 implements MigrationInterface {
  name = 'AddRefreshTokenFamilies1794800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('refresh_tokens', 'family_id'))) {
      await queryRunner.query(
        `ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" text`,
      );
    }
    if (!(await queryRunner.hasColumn('refresh_tokens', 'rotated_at'))) {
      await queryRunner.query(
        `ALTER TABLE "refresh_tokens" ADD COLUMN "rotated_at" datetime`,
      );
    }
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
    );
  }

  async down(): Promise<void> {
    // Forward-only: dropping a column is not worth the risk on production data.
  }
}
