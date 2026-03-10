import { EventEmitter } from 'node:events';
import type { QueueTask, QueueStatus, TaskCallback } from './types.js';
import type { AgentRunner, AgentRequest, AgentResult } from '../agent/types.js';
import type { SoulConfig } from '../config/schema.js';
import type { MemoryProvider } from '../agent/prompt-builder.js';
import { buildSystemContext, buildPrompt } from '../agent/prompt-builder.js';
import type { HistoryLogger } from '../persistence/history.js';
import type { Logger } from '../utils/logger.js';

interface QueueEntry {
  task: QueueTask;
  callback: TaskCallback;
  abortController: AbortController;
}

export class LaneQueue extends EventEmitter {
  private queue: QueueEntry[] = [];
  private currentEntry: QueueEntry | null = null;
  private _status: QueueStatus = 'idle';
  private startTime: number = 0;

  constructor(
    private readonly runner: AgentRunner,
    private readonly config: SoulConfig,
    private readonly memory: MemoryProvider,
    private readonly history: HistoryLogger,
    private readonly logger: Logger,
  ) {
    super();
  }

  get status(): QueueStatus {
    return this._status;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get currentTaskId(): string | undefined {
    return this.currentEntry?.task.id;
  }

  get elapsedMs(): number {
    if (!this.currentEntry) return 0;
    return Date.now() - this.startTime;
  }

  enqueue(task: QueueTask, callback: TaskCallback): void {
    if (this._status === 'draining') {
      this.logger.warn({ taskId: task.id }, 'Queue draining, task rejected');
      return;
    }

    const entry: QueueEntry = {
      task,
      callback,
      abortController: new AbortController(),
    };
    this.queue.push(entry);
    this.logger.info(
      { taskId: task.id, queueLength: this.queue.length },
      'Task enqueued',
    );

    if (this._status === 'idle') {
      this.processNext();
    }
  }

  cancelCurrent(): boolean {
    if (this.currentEntry) {
      this.logger.info(
        { taskId: this.currentEntry.task.id },
        'Cancelling current task',
      );
      this.currentEntry.abortController.abort();
      return true;
    }
    return false;
  }

  getInfo(): {
    status: QueueStatus;
    queueLength: number;
    currentTaskId?: string;
    elapsedMs: number;
  } {
    return {
      status: this._status,
      queueLength: this.queue.length,
      currentTaskId: this.currentEntry?.task.id,
      elapsedMs: this.elapsedMs,
    };
  }

  async drain(timeoutMs: number): Promise<void> {
    this._status = 'draining';
    this.queue = [];

    if (!this.currentEntry) return;

    await Promise.race([
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.currentEntry) {
            clearInterval(check);
            resolve();
          }
        }, 200);
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this._status = 'idle';
      this.currentEntry = null;
      this.emit('idle');
      return;
    }

    this._status = 'processing';
    this.currentEntry = this.queue.shift()!;
    this.startTime = Date.now();
    const { task, callback, abortController } = this.currentEntry;

    this.logger.info({ taskId: task.id, source: task.source }, 'Processing task');
    this.emit('taskStart', task);

    const systemContext = buildSystemContext(this.config, this.memory);

    const request: AgentRequest = {
      prompt: buildPrompt(task.prompt, this.config),
      cwd: task.cwd ?? this.config.agent.cwd,
      systemContext,
      model: this.config.agent.model,
      maxBudgetUsd: task.maxBudgetUsd ?? this.config.agent.maxBudgetUsd,
      maxTurns: task.maxTurns ?? this.config.agent.maxTurns,
      allowedTools: this.config.agent.allowedTools,
      permissionMode: task.permissionMode ?? this.config.agent.permissionMode,
      mcpServers: this.config.agent.mcpServers,
      abortController,
      sessionId: task.sessionId,
      onProgress: task.onProgress,
    };

    let result: AgentResult;
    try {
      result = await this.runner.run(request);
    } catch (err) {
      result = {
        success: false,
        result: '',
        sessionId: '',
        durationMs: Date.now() - this.startTime,
        costUsd: 0,
        numTurns: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    await this.history.append({
      id: task.id,
      source: task.source,
      prompt: task.prompt,
      result: result.result,
      success: result.success,
      sessionId: result.sessionId,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      numTurns: result.numTurns,
      error: result.error,
      timestamp: new Date().toISOString(),
    });

    try {
      await callback(result);
    } catch (err) {
      this.logger.error({ err, taskId: task.id }, 'Task callback failed');
    }

    this.emit('taskComplete', task, result);
    this.processNext();
  }
}
