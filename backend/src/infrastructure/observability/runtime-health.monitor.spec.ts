import { Logger } from '@nestjs/common';
import { FakeTelemetry } from '../../application/test/in-memory-repositories';
import { RuntimeHealthMonitor } from './runtime-health.monitor';

function blockEventLoop(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait on purpose
  }
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RuntimeHealthMonitor', () => {
  let telemetry: FakeTelemetry;
  let monitor: RuntimeHealthMonitor;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    telemetry = new FakeTelemetry();
    monitor = new RuntimeHealthMonitor(telemetry);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    monitor.start();
  });

  afterEach(() => {
    monitor.stop();
    warn.mockRestore();
  });

  it('has no sample before the first one is taken', () => {
    expect(monitor.lastSample).toBeNull();
  });

  it('measures an event-loop block, reports it and warns on p99', async () => {
    await tick(50);
    blockEventLoop(500);
    await tick(50);

    const sample = monitor.sample();

    expect(sample.lag_max_ms).toBeGreaterThanOrEqual(400);
    expect(sample.elu).toBeGreaterThan(0);
    expect(sample.heap_used_mb).toBeGreaterThan(0);
    expect(sample.rss_mb).toBeGreaterThan(0);
    expect(monitor.lastSample).toEqual(sample);
    expect(telemetry.captured).toEqual([
      { event: { name: 'runtime_health', properties: sample } },
    ]);
    expect(JSON.stringify(warn.mock.calls)).toContain('p99');
  });

  it('resets the histogram between samples', async () => {
    await tick(50);
    blockEventLoop(500);
    await tick(50);
    monitor.sample();

    await tick(200);
    const second = monitor.sample();

    expect(second.lag_max_ms).toBeLessThan(100);
  });

  it('stops measuring once stopped', () => {
    monitor.stop();

    expect(() => {
      monitor.stop();
    }).not.toThrow();
  });
});
