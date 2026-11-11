import { Logger } from '@nestjs/common';
import { PurgeExpiredTokensUseCase } from '../../application/auth/purge-expired-tokens.use-case';
import { TokenPurgeScheduler } from './token-purge.scheduler';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('TokenPurgeScheduler', () => {
  let execute: jest.Mock;
  let scheduler: TokenPurgeScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    execute = jest.fn().mockResolvedValue({
      magicLinks: 1,
      authorizationCodes: 0,
      refreshTokens: 0,
    });
    scheduler = new TokenPurgeScheduler({
      execute,
    } as unknown as PurgeExpiredTokensUseCase);
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('purges once at startup, then every six hours', async () => {
    scheduler.onApplicationBootstrap();
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(SIX_HOURS);
    await flush();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('stops on shutdown', async () => {
    scheduler.onApplicationBootstrap();
    scheduler.onApplicationShutdown();

    jest.advanceTimersByTime(3 * SIX_HOURS);
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs a failed purge without propagating it', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    execute.mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    expect(() => {
      scheduler.onApplicationBootstrap();
    }).not.toThrow();
    await flush();

    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).toContain('Token purge failed');
  });
});
