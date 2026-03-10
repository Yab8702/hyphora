import type { AgentResult, ProgressCallback } from '../agent/types.js';

export interface QueueTask {
  id: string;
  source: 'telegram' | 'cron' | 'webhook';
  prompt: string;
  chatId?: number;
  messageId?: number;
  createdAt: string;
  cwd?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  sessionId?: string;
  permissionMode?: string;
  channelType?: string;
  channelId?: string;
  onProgress?: ProgressCallback;
}

export type QueueStatus = 'idle' | 'processing' | 'draining';

export type TaskCallback = (result: AgentResult) => Promise<void>;
