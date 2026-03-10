import type { AgentRequest, AgentResult, AgentRunner } from './types.js';

/**
 * Agent runner using the Claude Agent SDK (@anthropic-ai/claude-agent-sdk).
 * This is the preferred integration path — it provides typed messages,
 * native session management, and abort support without subprocess management.
 */
export class SdkAgentRunner implements AgentRunner {
  async run(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();
    let sessionId = '';
    let resultText = '';
    let costUsd = 0;
    let durationMs = 0;
    let numTurns = 0;
    let isError = false;
    let errorMsg = '';

    try {
      // Dynamic import to allow graceful fallback if SDK is not available
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const abortController = request.abortController ?? new AbortController();

      const systemPrompt = request.systemContext
        ? {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: request.systemContext,
          }
        : {
            type: 'preset' as const,
            preset: 'claude_code' as const,
          };

      const queryIterator = query({
        prompt: request.prompt,
        options: {
          cwd: request.cwd,
          model: request.model,
          allowedTools: request.allowedTools,
          permissionMode: (request.permissionMode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') ?? 'acceptEdits',
          maxBudgetUsd: request.maxBudgetUsd,
          maxTurns: request.maxTurns,
          systemPrompt,
          abortController,
          ...(request.sessionId ? { resume: request.sessionId } : {}),
        },
      });

      for await (const message of queryIterator) {
        const msg = message as Record<string, unknown>;

        if (msg.type === 'system' && msg.subtype === 'init') {
          sessionId = String(msg.session_id ?? '');
          request.onProgress?.({
            type: 'init',
            timestamp: Date.now(),
            sessionId,
          });
        }

        // Emit progress for tool use events
        if (msg.type === 'assistant' && msg.subtype === 'tool_use') {
          request.onProgress?.({
            type: 'tool_start',
            timestamp: Date.now(),
            toolName: String(msg.tool_name ?? msg.name ?? 'unknown'),
            toolInput: typeof msg.input === 'string'
              ? msg.input
              : typeof msg.input === 'object'
                ? JSON.stringify(msg.input).slice(0, 200)
                : undefined,
          });
        }

        // Emit progress for tool results
        if (msg.type === 'tool_result') {
          request.onProgress?.({
            type: 'tool_result',
            timestamp: Date.now(),
            toolName: String(msg.tool_name ?? ''),
          });
        }

        // Emit progress for assistant text
        if (msg.type === 'assistant' && msg.subtype === 'text') {
          const text = String(msg.text ?? msg.content ?? '');
          if (text) {
            request.onProgress?.({
              type: 'assistant_reply',
              timestamp: Date.now(),
              text: text.slice(0, 300),
            });
          }
        }

        // Emit progress for thinking
        if (msg.type === 'assistant' && msg.subtype === 'thinking') {
          const text = String(msg.text ?? msg.content ?? '');
          if (text) {
            request.onProgress?.({
              type: 'assistant_thinking',
              timestamp: Date.now(),
              text: text.slice(0, 300),
            });
          }
        }

        if (msg.type === 'result') {
          sessionId = String(msg.session_id ?? sessionId);
          durationMs = Number(msg.duration_ms ?? Date.now() - startTime);
          costUsd = Number(msg.total_cost_usd ?? 0);
          numTurns = Number(msg.num_turns ?? 0);
          isError = Boolean(msg.is_error);

          if (msg.subtype === 'success') {
            resultText = String(msg.result ?? '');
          } else {
            const errors = Array.isArray(msg.errors)
              ? msg.errors.join('\n')
              : String(msg.errors ?? 'Unknown error');
            errorMsg = errors;
          }
        }
      }
    } catch (err) {
      isError = true;
      errorMsg = err instanceof Error ? err.message : String(err);
      durationMs = Date.now() - startTime;
    }

    return {
      success: !isError,
      result: isError ? errorMsg : resultText,
      sessionId,
      durationMs,
      costUsd,
      numTurns,
      error: isError ? errorMsg : undefined,
    };
  }
}
