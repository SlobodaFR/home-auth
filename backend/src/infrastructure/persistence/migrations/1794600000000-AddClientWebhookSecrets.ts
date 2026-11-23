import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * clients.webhook_secret / webhook_secret_previous / webhook_secret_previous_expires_at (PC8):
 * HMAC keys of the logout webhook, all nullable (no backfill: a secret exists only after an
 * explicit "Régénérer"). SQLite has no ADD COLUMN IF NOT EXISTS, hence the hasColumn guards
 * (idempotent on a re-run).
 */
export class AddClientWebhookSecrets1794600000000 implements MigrationInterface {
  name = 'AddClientWebhookSecrets1794600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, type] of [
      ['webhook_secret', 'text'],
      ['webhook_secret_previous', 'text'],
      ['webhook_secret_previous_expires_at', 'datetime'],
    ] as const) {
      if (!(await queryRunner.hasColumn('clients', column))) {
        await queryRunner.query(
          `ALTER TABLE "clients" ADD COLUMN "${column}" ${type}`,
        );
      }
    }
  }

  async down(): Promise<void> {
    // Forward-only: dropping a column is not worth the risk on production data.
  }
}
