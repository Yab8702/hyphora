import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CronManager } from '../../src/scheduler/cron-manager.js';
import { SoulConfigSchema } from '../../src/config/schema.js';
import type { LaneQueue } from '../../src/queue/lane-queue.js';
import type { Logger } from '../../src/utils/logger.js';

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  } as unknown as Logger;
}

function makeQueue(): LaneQueue {
  return {
    enqueue: vi.fn(),
  } as unknown as LaneQueue;
}

function makeConfig(schedules: any[] = []) {
  return SoulConfigSchema.parse({
    version: 1,
    telegram: { allowedChatIds: [1], notifyChatId: 1 },
    agent: { cwd: '/tmp' },
    schedules,
  });
}

describe('CronManager', () => {
  let logger: Logger;
  let queue: LaneQueue;

  beforeEach(() => {
    logger = makeLogger();
    queue = makeQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with zero jobs when no schedules configured', () => {
    const config = makeConfig([]);
    const manager = new CronManager(config, queue, logger);
    manager.start();

    expect(manager.jobCount).toBe(0);
    manager.stop();
  });

  it('registers enabled schedules', () => {
    const config = makeConfig([
      { name: 'test-job', cron: '*/5 * * * *', prompt: 'Run tests', enabled: true },
    ]);
    const manager = new CronManager(config, queue, logger);
    manager.start();

    expect(manager.jobCount).toBe(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'test-job' }),
      'Cron job registered',
    );
    manager.stop();
  });

  it('skips disabled schedules', () => {
    const config = makeConfig([
      { name: 'disabled-job', cron: '*/5 * * * *', prompt: 'Skip me', enabled: false },
    ]);
    const manager = new CronManager(config, queue, logger);
    manager.start();

    expect(manager.jobCount).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'disabled-job' }),
      'Schedule disabled, skipping',
    );
    manager.stop();
  });

  it('skips invalid cron expressions', () => {
    const config = makeConfig([
      { name: 'bad-cron', cron: 'not-a-cron', prompt: 'Will fail', enabled: true },
    ]);
    const manager = new CronManager(config, queue, logger);
    manager.start();

    expect(manager.jobCount).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'bad-cron' }),
      'Invalid cron expression, skipping',
    );
    manager.stop();
  });

  it('registers multiple schedules', () => {
    const config = makeConfig([
      { name: 'job-1', cron: '0 * * * *', prompt: 'Hourly task', enabled: true },
      { name: 'job-2', cron: '0 2 * * *', prompt: 'Nightly task', enabled: true },
      { name: 'job-3', cron: '*/10 * * * *', prompt: 'Frequent task', enabled: false },
    ]);
    const manager = new CronManager(config, queue, logger);
    manager.start();

    expect(manager.jobCount).toBe(2); // 2 enabled, 1 disabled
    manager.stop();
  });

  it('stop clears all jobs', () => {
    const config = makeConfig([
      { name: 'job-1', cron: '0 * * * *', prompt: 'Task 1', enabled: true },
      { name: 'job-2', cron: '0 2 * * *', prompt: 'Task 2', enabled: true },
    ]);
    const manager = new CronManager(config, queue, logger);
    manager.start();

    expect(manager.jobCount).toBe(2);

    manager.stop();

    expect(manager.jobCount).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'job-1' }),
      'Cron job stopped',
    );
  });

  it('can be started and stopped multiple times', () => {
    const config = makeConfig([
      { name: 'job-1', cron: '0 * * * *', prompt: 'Task 1', enabled: true },
    ]);
    const manager = new CronManager(config, queue, logger);

    manager.start();
    expect(manager.jobCount).toBe(1);

    manager.stop();
    expect(manager.jobCount).toBe(0);

    manager.start();
    expect(manager.jobCount).toBe(1);

    manager.stop();
    expect(manager.jobCount).toBe(0);
  });
});
