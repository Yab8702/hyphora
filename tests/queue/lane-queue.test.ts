import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LaneQueue } from '../../src/queue/lane-queue.js';
import type { AgentRunner, AgentRequest, AgentResult } from '../../src/agent/types.js';
import type { HistoryLogger } from '../../src/persistence/history.js';
import type { MemoryProvider } from '../../src/agent/prompt-builder.js';
import { SoulConfigSchema } from '../../src/config/schema.js';
import type { Logger } from '../../src/utils/logger.js';
import type { QueueTask } from '../../src/queue/types.js';

function makeConfig() {
  return SoulConfigSchema.parse({
    version: 1,
    telegram: { allowedChatIds: [1] },
    agent: { cwd: '/tmp' },
  });
}

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

function makeMemory(): MemoryProvider {
  return { getAllMemory: () => '' };
}

function makeHistory(): HistoryLogger {
  return { append: vi.fn().mockResolvedValue(undefined) } as unknown as HistoryLogger;
}

function makeTask(id: string = 'task-1'): QueueTask {
  return {
    id,
    source: 'telegram',
    prompt: `Task ${id}`,
    createdAt: new Date().toISOString(),
  };
}

function makeRunner(
  impl?: (req: AgentRequest) => Promise<AgentResult>,
): AgentRunner {
  const defaultImpl = async (): Promise<AgentResult> => ({
    success: true,
    result: 'Done',
    sessionId: 'sess-1',
    durationMs: 100,
    costUsd: 0.1,
    numTurns: 1,
  });
  return { run: impl ?? defaultImpl };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('LaneQueue', () => {
  let config: ReturnType<typeof makeConfig>;
  let logger: Logger;
  let memory: MemoryProvider;
  let history: HistoryLogger;

  beforeEach(() => {
    config = makeConfig();
    logger = makeLogger();
    memory = makeMemory();
    history = makeHistory();
  });

  it('starts in idle state', () => {
    const queue = new LaneQueue(makeRunner(), config, memory, history, logger);
    expect(queue.status).toBe('idle');
    expect(queue.queueLength).toBe(0);
  });

  it('processes a single task and calls callback', async () => {
    const runner = makeRunner();
    const queue = new LaneQueue(runner, config, memory, history, logger);
    const callback = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(makeTask(), callback);

    // Wait for processing to complete
    await new Promise<void>((resolve) => queue.once('idle', resolve));

    expect(callback).toHaveBeenCalledOnce();
    const result = callback.mock.calls[0][0] as AgentResult;
    expect(result.success).toBe(true);
    expect(result.result).toBe('Done');
  });

  it('processes tasks serially (one at a time)', async () => {
    const executionOrder: string[] = [];
    const runner = makeRunner(async (req) => {
      const id = req.prompt;
      executionOrder.push(`start-${id}`);
      await delay(50);
      executionOrder.push(`end-${id}`);
      return {
        success: true,
        result: id,
        sessionId: '',
        durationMs: 50,
        costUsd: 0,
        numTurns: 1,
      };
    });

    const queue = new LaneQueue(runner, config, memory, history, logger);
    const cb = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(makeTask('t1'), cb);
    queue.enqueue(makeTask('t2'), cb);
    queue.enqueue(makeTask('t3'), cb);

    await new Promise<void>((resolve) => queue.once('idle', resolve));

    // Tasks must be serial: start-1, end-1, start-2, end-2, start-3, end-3
    expect(executionOrder).toEqual([
      'start-Task t1',
      'end-Task t1',
      'start-Task t2',
      'end-Task t2',
      'start-Task t3',
      'end-Task t3',
    ]);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('logs to history after each task', async () => {
    const queue = new LaneQueue(makeRunner(), config, memory, history, logger);
    const cb = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(makeTask('h1'), cb);
    await new Promise<void>((resolve) => queue.once('idle', resolve));

    expect(history.append).toHaveBeenCalledOnce();
    const entry = (history.append as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.id).toBe('h1');
    expect(entry.success).toBe(true);
  });

  it('handles agent runner errors gracefully', async () => {
    const runner = makeRunner(async () => {
      throw new Error('Agent crashed');
    });
    const queue = new LaneQueue(runner, config, memory, history, logger);
    const cb = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(makeTask(), cb);
    await new Promise<void>((resolve) => queue.once('idle', resolve));

    expect(cb).toHaveBeenCalledOnce();
    const result = cb.mock.calls[0][0] as AgentResult;
    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent crashed');
  });

  it('handles callback errors without crashing', async () => {
    const queue = new LaneQueue(makeRunner(), config, memory, history, logger);
    const badCb = vi.fn().mockRejectedValue(new Error('Callback failed'));
    const goodCb = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(makeTask('t1'), badCb);
    queue.enqueue(makeTask('t2'), goodCb);

    await new Promise<void>((resolve) => queue.once('idle', resolve));

    expect(badCb).toHaveBeenCalledOnce();
    expect(goodCb).toHaveBeenCalledOnce();
  });

  it('rejects tasks when draining', async () => {
    const runner = makeRunner(async () => {
      await delay(200);
      return {
        success: true, result: '', sessionId: '',
        durationMs: 200, costUsd: 0, numTurns: 0,
      };
    });
    const queue = new LaneQueue(runner, config, memory, history, logger);
    const cb = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(makeTask('t1'), cb);
    await delay(10); // Let processing start

    // Start draining
    const drainPromise = queue.drain(5000);

    // Try to enqueue during drain
    queue.enqueue(makeTask('t2'), cb);

    await drainPromise;

    // t2 should have been rejected
    expect(cb).toHaveBeenCalledTimes(1); // Only t1's callback
  });

  it('drain resolves immediately when idle', async () => {
    const queue = new LaneQueue(makeRunner(), config, memory, history, logger);
    await queue.drain(100);
    expect(queue.status).toBe('draining');
  });

  it('getInfo returns current state', async () => {
    const runner = makeRunner(async () => {
      await delay(100);
      return {
        success: true, result: '', sessionId: '',
        durationMs: 100, costUsd: 0, numTurns: 0,
      };
    });
    const queue = new LaneQueue(runner, config, memory, history, logger);
    const cb = vi.fn().mockResolvedValue(undefined);

    const info1 = queue.getInfo();
    expect(info1.status).toBe('idle');
    expect(info1.queueLength).toBe(0);
    expect(info1.currentTaskId).toBeUndefined();

    queue.enqueue(makeTask('s1'), cb);
    await delay(10);

    const info2 = queue.getInfo();
    expect(info2.status).toBe('processing');
    expect(info2.currentTaskId).toBe('s1');
    expect(info2.elapsedMs).toBeGreaterThan(0);

    await new Promise<void>((resolve) => queue.once('idle', resolve));
  });

  it('emits taskStart and taskComplete events', async () => {
    const queue = new LaneQueue(makeRunner(), config, memory, history, logger);
    const cb = vi.fn().mockResolvedValue(undefined);
    const starts: string[] = [];
    const completes: string[] = [];

    queue.on('taskStart', (task: QueueTask) => starts.push(task.id));
    queue.on('taskComplete', (task: QueueTask) => completes.push(task.id));

    queue.enqueue(makeTask('e1'), cb);
    queue.enqueue(makeTask('e2'), cb);

    await new Promise<void>((resolve) => queue.once('idle', resolve));

    expect(starts).toEqual(['e1', 'e2']);
    expect(completes).toEqual(['e1', 'e2']);
  });
});
