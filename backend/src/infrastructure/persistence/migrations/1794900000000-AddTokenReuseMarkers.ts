import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reuse markers (PC1 amended, PC2): refresh_tokens.grace_used_at (the single grace re-issue of a
 * rotated token was spent) and authorization_codes.reused_at (durable code reuse marker checked
 * by the redemption winner). Nullable, no backfill: existing rows have no marker. SQLite has no
 * ADD COLUMN IF NOT EXISTS, hence the hasColumn guards (idempotent on a re-run).
 */
export class AddTokenReuseMarkers1794900000000 implements MigrationInterface {
  name = 'AddTokenReuseMarkers1794900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('refresh_tokens', 'grace_used_at'))) {
      await queryRunner.query(
        `ALTER TABLE "refresh_tokens" ADD COLUMN "grace_used_at" datetime`,
      );
    }
    if (!(await queryRunner.hasColumn('authorization_codes', 'reused_at'))) {
      await queryRunner.query(
        `ALTER TABLE "authorization_codes" ADD COLUMN "reused_at" datetime`,
      );
    }
  }

  async down(): Promise<void> {
    // Forward-only: dropping a column is not worth the risk on production data.
  }
}
