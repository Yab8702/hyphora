export type ProgressEventType =
  | 'init'
  | 'tool_start'
  | 'tool_result'
  | 'assistant_reply'
  | 'assistant_thinking';

export interface ProgressEvent {
  type: ProgressEventType;
  timestamp: number;
  toolName?: string;
  toolInput?: string;
  text?: string;
  sessionId?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface AgentRequest {
  prompt: string;
  cwd: string;
  systemContext: string;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  allowedTools?: string[];
  permissionMode?: string;
  mcpServers?: Record<string, unknown>;
  sessionId?: string;
  abortController?: AbortController;
  onProgress?: ProgressCallback;
}

export interface AgentResult {
  success: boolean;
  result: string;
  sessionId: string;
  durationMs: number;
  costUsd: number;
  numTurns: number;
  error?: string;
}

export type AgentStatus = 'idle' | 'running' | 'error';

export interface AgentRunner {
  run(request: AgentRequest): Promise<AgentResult>;
}
