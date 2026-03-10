import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock grammy before imports
vi.mock('grammy', () => {
  class MockBot {
    use = vi.fn();
    command = vi.fn();
    on = vi.fn();
    catch = vi.fn();
    start = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    api = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      getFile: vi.fn().mockResolvedValue({ file_path: 'test.jpg' }),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
  }
  return { Bot: MockBot };
});

// Mock pino-pretty transport (may not be available in test)
vi.mock('pino', async () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  };
  return {
    default: vi.fn(() => mockLogger),
  };
});

import { startDaemon } from '../../src/daemon.js';

describe('Daemon lifecycle', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `hyphora-daemon-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    configPath = join(testDir, 'soul.yaml');

    // Set required env var
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';

    const config = `
version: 1
telegram:
  allowedChatIds: [12345]
agent:
  cwd: "${testDir.replace(/\\/g, '/')}"
paths:
  dataDir: "${join(testDir, 'data').replace(/\\/g, '/')}"
schedules: []
`;
    await writeFile(configPath, config, 'utf-8');
  });

  afterEach(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  it('boots all subsystems successfully', async () => {
    const ctx = await startDaemon(configPath);

    expect(ctx.config).toBeDefined();
    expect(ctx.config.version).toBe(1);
    expect(ctx.logger).toBeDefined();
    expect(ctx.queue).toBeDefined();
    expect(ctx.memory).toBeDefined();
    expect(ctx.history).toBeDefined();
    expect(ctx.cronManager).toBeDefined();
    expect(ctx.heartbeat).toBeDefined();
    expect(ctx.dispatcher).toBeDefined();

    // Clean up
    ctx.heartbeat.stop();
    ctx.cronManager.stop();
  });

  it('initializes memory directory', async () => {
    const ctx = await startDaemon(configPath);
    const { existsSync } = await import('node:fs');
    const memoryDir = join(testDir, 'data', 'memory');
    expect(existsSync(memoryDir)).toBe(true);

    ctx.heartbeat.stop();
    ctx.cronManager.stop();
  });

  it('starts with zero cron jobs when none configured', async () => {
    const ctx = await startDaemon(configPath);
    expect(ctx.cronManager.jobCount).toBe(0);

    ctx.heartbeat.stop();
    ctx.cronManager.stop();
  });

  it('queue starts in idle state', async () => {
    const ctx = await startDaemon(configPath);
    expect(ctx.queue.status).toBe('idle');
    expect(ctx.queue.queueLength).toBe(0);

    ctx.heartbeat.stop();
    ctx.cronManager.stop();
  });

  it('fails to start with missing config', async () => {
    await expect(startDaemon('/nonexistent/soul.yaml')).rejects.toThrow();
  });

  it('fails to start without TELEGRAM_BOT_TOKEN', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(startDaemon(configPath)).rejects.toThrow('TELEGRAM_BOT_TOKEN');
  });

  it('starts cron jobs from config', async () => {
    const configWithCron = `
version: 1
telegram:
  allowedChatIds: [12345]
  notifyChatId: 12345
agent:
  cwd: "${testDir.replace(/\\/g, '/')}"
paths:
  dataDir: "${join(testDir, 'data').replace(/\\/g, '/')}"
schedules:
  - name: test-cron
    cron: "0 * * * *"
    prompt: "Run hourly check"
    enabled: true
`;
    await writeFile(configPath, configWithCron, 'utf-8');

    const ctx = await startDaemon(configPath);
    expect(ctx.cronManager.jobCount).toBe(1);

    ctx.heartbeat.stop();
    ctx.cronManager.stop();
  });
});
