import { Logger } from '@nestjs/common';
import type { Logger as TypeOrmLogger } from 'typeorm';

/** better-sqlite3 runs on the event loop: a query this slow blocks every request meanwhile. */
export const SLOW_QUERY_THRESHOLD_MS = 20;

/**
 * TypeORM logger that only reports slow and failed queries. Parameters are never logged: they
 * carry emails and token hashes.
 */
export class SlowQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('SQL');

  logQuerySlow(time: number, query: string): void {
    this.logger.warn(`Slow query (${time.toString()}ms): ${query}`);
  }

  logQueryError(error: string | Error, query: string): void {
    const message = error instanceof Error ? error.message : error;
    this.logger.error(`Query failed (${message}): ${query}`);
  }

  logQuery(): void {
    // Normal queries are not logged.
  }

  logSchemaBuild(): void {
    // Not logged.
  }

  logMigration(): void {
    // Not logged.
  }

  log(): void {
    // TypeORM internal messages are not logged.
  }
}
