import type { MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { DataSource, Logger as TypeOrmLogger } from 'typeorm';
import { SLOW_QUERY_THRESHOLD_MS, SlowQueryLogger } from './slow-query.logger';

// Used through TypeORM's interface, which passes the parameters.
const sqlLogger = (): TypeOrmLogger => new SlowQueryLogger();

describe('SlowQueryLogger', () => {
  let warn: MockInstance;
  let error: MockInstance;
  let log: MockInstance;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs a slow query with its duration and SQL, never its parameters', () => {
    sqlLogger().logQuerySlow(42, 'SELECT * FROM users WHERE email = ?', [
      'a@b.c',
    ]);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('42');
    expect(logged).toContain('SELECT * FROM users');
    expect(logged).not.toContain('a@b.c');
  });

  it('logs a failed query without its parameters', () => {
    sqlLogger().logQueryError(
      new Error('SQLITE_BUSY: database is locked'),
      'UPDATE users SET name = ?',
      ['Alice'],
    );

    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('SQLITE_BUSY');
    expect(logged).not.toContain('Alice');
  });

  it('stays silent for normal queries, schema and migrations', () => {
    const logger = sqlLogger();

    logger.logQuery('SELECT 1', ['a@b.c']);
    logger.logSchemaBuild('CREATE TABLE users');
    logger.logMigration('migration');
    logger.log('info', 'a@b.c');

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('is called by TypeORM for queries over the threshold', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      maxQueryExecutionTime: SLOW_QUERY_THRESHOLD_MS,
      logger: new SlowQueryLogger(),
    });
    await dataSource.initialize();
    try {
      await dataSource.query(
        'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 3000000) SELECT COUNT(*) FROM n WHERE i > ?',
        [-1],
      );
    } finally {
      await dataSource.destroy();
    }

    expect(JSON.stringify(warn.mock.calls)).toContain('WITH RECURSIVE');
  });
});
