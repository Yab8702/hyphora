import { spawn } from 'node:child_process';
import type { AgentRequest, AgentResult, AgentRunner, ProgressCallback } from './types.js';

export class CliAgentRunner implements AgentRunner {
  async run(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();
    const args = this.buildArgs(request);

    return new Promise<AgentResult>((resolve) => {
      let stdout = '';
      let stderr = '';

      const env = { ...process.env };
      // Prevent nesting detection error when running inside Claude Code
      delete env.CLAUDECODE;
      delete env.CLAUDE_CODE_ENTRYPOINT;
      delete env.CLAUDE_CODE_SSE_PORT;

      // Build a single command string with proper quoting for shell execution.
      // spawn + shell:true + args array doesn't quote args properly on Windows,
      // causing prompts with spaces to be split.
      const escapedArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`);
      const command = `claude ${escapedArgs.join(' ')}`;

      const proc = spawn(command, [], {
        cwd: request.cwd,
        shell: true,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Try to emit progress events from streaming JSON lines
        if (request.onProgress) {
          this.emitProgressFromChunk(chunk, request.onProgress);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      if (request.abortController) {
        request.abortController.signal.addEventListener('abort', () => {
          proc.kill('SIGTERM');
        });
      }

      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        resolve(this.parseOutput(stdout, stderr, code, durationMs));
      });

      proc.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          result: '',
          sessionId: '',
          durationMs,
          costUsd: 0,
          numTurns: 0,
          error: `Failed to spawn claude: ${err.message}`,
        });
      });
    });
  }

  private buildArgs(request: AgentRequest): string[] {
    // CLI always uses json output — stream-json requires --verbose and
    // subprocess stdout is buffered anyway, so real-time streaming isn't viable.
    // Progress events for CLI come from parsing the final JSON blob.
    const args = ['-p', request.prompt, '--output-format', 'json'];

    if (request.model) {
      args.push('--model', request.model);
    }
    if (request.maxBudgetUsd !== undefined) {
      args.push('--max-budget-usd', String(request.maxBudgetUsd));
    }
    if (request.maxTurns !== undefined) {
      args.push('--max-turns', String(request.maxTurns));
    }
    if (request.allowedTools && request.allowedTools.length > 0) {
      args.push('--allowedTools', ...request.allowedTools);
    }
    if (request.sessionId) {
      args.push('--resume', request.sessionId);
    }
    if (request.permissionMode === 'god' || request.permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    }

    return args;
  }

  private parseOutput(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    durationMs: number,
  ): AgentResult {
    // Try to parse the JSON output from --output-format json
    try {
      const messages = JSON.parse(stdout);
      if (Array.isArray(messages)) {
        return this.parseMessageArray(messages, durationMs);
      }
      // Single JSON object
      if (messages && typeof messages === 'object') {
        return this.parseSingleMessage(messages, durationMs);
      }
    } catch {
      // JSON parse failed — raw text output
    }

    return {
      success: exitCode === 0,
      result: stdout.trim() || stderr.trim() || 'No output from agent',
      sessionId: '',
      durationMs,
      costUsd: 0,
      numTurns: 0,
      error: exitCode !== 0 ? `Exit code ${exitCode}: ${stderr.trim()}` : undefined,
    };
  }

  private parseMessageArray(
    messages: unknown[],
    durationMs: number,
  ): AgentResult {
    // Find the last result-type message
    const resultMsg = [...messages]
      .reverse()
      .find(
        (m): m is Record<string, unknown> =>
          typeof m === 'object' && m !== null && (m as Record<string, unknown>).type === 'result',
      );

    const initMsg = messages.find(
      (m): m is Record<string, unknown> =>
        typeof m === 'object' &&
        m !== null &&
        (m as Record<string, unknown>).type === 'system' &&
        (m as Record<string, unknown>).subtype === 'init',
    );

    if (resultMsg) {
      const isSuccess = resultMsg.subtype === 'success';
      const errors = Array.isArray(resultMsg.errors)
        ? resultMsg.errors.join('\n')
        : undefined;

      return {
        success: isSuccess,
        result: isSuccess
          ? String(resultMsg.result ?? '')
          : String(errors ?? 'Unknown error'),
        sessionId: String(
          resultMsg.session_id ?? (initMsg as Record<string, unknown>)?.session_id ?? '',
        ),
        durationMs: Number(resultMsg.duration_ms ?? durationMs),
        costUsd: Number(resultMsg.total_cost_usd ?? 0),
        numTurns: Number(resultMsg.num_turns ?? 0),
        error: isSuccess ? undefined : String(errors ?? 'Agent returned error'),
      };
    }

    // No result message found — extract text from assistant messages
    const textParts = messages
      .filter(
        (m): m is Record<string, unknown> =>
          typeof m === 'object' && m !== null && (m as Record<string, unknown>).type === 'assistant',
      )
      .map((m) => String(m.content ?? ''))
      .filter(Boolean);

    return {
      success: textParts.length > 0,
      result: textParts.join('\n') || 'No meaningful output',
      sessionId: String((initMsg as Record<string, unknown>)?.session_id ?? ''),
      durationMs,
      costUsd: 0,
      numTurns: 0,
    };
  }

  private emitProgressFromChunk(chunk: string, onProgress: ProgressCallback): void {
    // CLI with --output-format json emits JSON objects. Try to parse lines.
    const lines = chunk.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.type === 'system' && msg.subtype === 'init') {
          onProgress({
            type: 'init',
            timestamp: Date.now(),
            sessionId: String(msg.session_id ?? ''),
          });
        } else if (msg.type === 'assistant' && msg.subtype === 'tool_use') {
          onProgress({
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
      } catch {
        // Not valid JSON line — skip
      }
    }
  }

  private parseSingleMessage(
    message: Record<string, unknown>,
    durationMs: number,
  ): AgentResult {
    return {
      success: message.subtype === 'success' || !message.errors,
      result: String(message.result ?? message.content ?? ''),
      sessionId: String(message.session_id ?? ''),
      durationMs: Number(message.duration_ms ?? durationMs),
      costUsd: Number(message.total_cost_usd ?? 0),
      numTurns: Number(message.num_turns ?? 0),
      error: message.errors
        ? String(
            Array.isArray(message.errors)
              ? message.errors.join('\n')
              : message.errors,
          )
        : undefined,
    };
  }
}
