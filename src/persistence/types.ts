export interface HistoryEntry {
  id: string;
  source: 'telegram' | 'cron' | 'webhook';
  prompt: string;
  result: string;
  success: boolean;
  sessionId: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  error?: string;
  timestamp: string;
}
