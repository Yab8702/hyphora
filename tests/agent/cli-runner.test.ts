import { describe, it, expect, vi } from 'vitest';
import { CliAgentRunner } from '../../src/agent/cli-runner.js';
import type { AgentRequest } from '../../src/agent/types.js';

// We mock child_process to avoid actually spawning claude
vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events');

  function createMockProcess(
    stdoutData: string,
    stderrData: string,
    exitCode: number,
  ) {
    const proc = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    proc.stdout = stdout;
    proc.stderr = stderr;
    proc.stdin = { write: vi.fn(), end: vi.fn() };
    proc.kill = vi.fn();

    setTimeout(() => {
      stdout.emit('data', Buffer.from(stdoutData));
      if (stderrData) stderr.emit('data', Buffer.from(stderrData));
      proc.emit('close', exitCode);
    }, 10);

    return proc;
  }

  let mockFactory: (cmd: string, args: string[], opts: unknown) => unknown;

  return {
    spawn: vi.fn((...spawnArgs: unknown[]) => {
      if (mockFactory) {
        return mockFactory(
          spawnArgs[0] as string,
          spawnArgs[1] as string[],
          spawnArgs[2],
        );
      }
      return createMockProcess('default output', '', 0);
    }),
    __setMockFactory: (fn: typeof mockFactory) => {
      mockFactory = fn;
    },
    __createMockProcess: createMockProcess,
  };
});

const { __setMockFactory, __createMockProcess } = await import(
  'node:child_process'
) as unknown as {
  __setMockFactory: (fn: (cmd: string, args: string[], opts: unknown) => unknown) => void;
  __createMockProcess: (stdout: string, stderr: string, code: number) => unknown;
};

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    prompt: 'test prompt',
    cwd: '/tmp',
    systemContext: '',
    ...overrides,
  };
}

describe('CliAgentRunner', () => {
  const runner = new CliAgentRunner();

  it('parses JSON array output with result message', async () => {
    const jsonOutput = JSON.stringify([
      { type: 'system', subtype: 'init', session_id: 'sess-123' },
      { type: 'assistant', content: 'Working...' },
      {
        type: 'result',
        subtype: 'success',
        result: 'Fixed the bug',
        session_id: 'sess-123',
        duration_ms: 5000,
        total_cost_usd: 0.25,
        num_turns: 3,
      },
    ]);

    __setMockFactory(() => __createMockProcess(jsonOutput, '', 0));

    const result = await runner.run(makeRequest());
    expect(result.success).toBe(true);
    expect(result.result).toBe('Fixed the bug');
    expect(result.sessionId).toBe('sess-123');
    expect(result.costUsd).toBe(0.25);
    expect(result.numTurns).toBe(3);
  });

  it('handles error result messages', async () => {
    const jsonOutput = JSON.stringify([
      { type: 'system', subtype: 'init', session_id: 'sess-456' },
      {
        type: 'result',
        subtype: 'error',
        errors: ['Rate limit exceeded'],
        session_id: 'sess-456',
      },
    ]);

    __setMockFactory(() => __createMockProcess(jsonOutput, '', 1));

    const result = await runner.run(makeRequest());
    expect(result.success).toBe(false);
    expect(result.result).toContain('Rate limit exceeded');
    expect(result.error).toContain('Rate limit exceeded');
  });

  it('handles non-JSON text output', async () => {
    __setMockFactory(() =>
      __createMockProcess('Plain text response', '', 0),
    );

    const result = await runner.run(makeRequest());
    expect(result.success).toBe(true);
    expect(result.result).toBe('Plain text response');
  });

  it('handles process exit with non-zero code and stderr', async () => {
    __setMockFactory(() =>
      __createMockProcess('', 'Command not found: claude', 127),
    );

    const result = await runner.run(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toContain('127');
    expect(result.error).toContain('Command not found');
  });

  it('passes model, budget, and turns in command string', async () => {
    __setMockFactory((cmd) => {
      expect(cmd).toContain('--model');
      expect(cmd).toContain('opus');
      expect(cmd).toContain('--max-budget-usd');
      expect(cmd).toContain('--max-turns');
      return __createMockProcess('{}', '', 0);
    });

    await runner.run(
      makeRequest({ model: 'opus', maxBudgetUsd: 2, maxTurns: 10 }),
    );
  });

  it('includes allowedTools in command string', async () => {
    __setMockFactory((cmd) => {
      expect(cmd).toContain('--allowedTools');
      expect(cmd).toContain('Read');
      expect(cmd).toContain('Write');
      return __createMockProcess('{}', '', 0);
    });

    await runner.run(makeRequest({ allowedTools: ['Read', 'Write'] }));
  });

  it('does not pass system context in command (handled via CLAUDE.md)', async () => {
    __setMockFactory((cmd) => {
      expect(cmd).not.toContain('--append-system-prompt');
      return __createMockProcess('{}', '', 0);
    });

    await runner.run(makeRequest({ systemContext: 'My context' }));
  });

  it('includes resume flag when sessionId provided', async () => {
    __setMockFactory((cmd) => {
      expect(cmd).toContain('--resume');
      expect(cmd).toContain('prev-session');
      return __createMockProcess('{}', '', 0);
    });

    await runner.run(makeRequest({ sessionId: 'prev-session' }));
  });

  it('always uses json output format (stream-json requires --verbose and is not viable for subprocesses)', async () => {
    __setMockFactory((cmd) => {
      expect(cmd).toContain('"json"');
      expect(cmd).not.toContain('stream-json');
      return __createMockProcess('{}', '', 0);
    });

    // Both with and without onProgress should use json
    await runner.run(makeRequest());
    await runner.run(makeRequest({ onProgress: vi.fn() }));
  });

  it('emits progress events from streaming JSON', async () => {
    const streamOutput =
      `{"type":"system","subtype":"init","session_id":"s1"}\n` +
      `{"type":"assistant","subtype":"tool_use","tool_name":"Read","input":"src/index.ts"}\n` +
      `{"type":"result","subtype":"success","result":"done","session_id":"s1"}\n`;

    __setMockFactory(() => __createMockProcess(streamOutput, '', 0));

    const events: unknown[] = [];
    const onProgress = vi.fn((e: unknown) => events.push(e));

    await runner.run(makeRequest({ onProgress }));

    expect(onProgress).toHaveBeenCalled();
    const initEvent = events.find(
      (e: any) => e.type === 'init',
    ) as any;
    expect(initEvent).toBeDefined();
    expect(initEvent.sessionId).toBe('s1');

    const toolEvent = events.find(
      (e: any) => e.type === 'tool_start',
    ) as any;
    expect(toolEvent).toBeDefined();
    expect(toolEvent.toolName).toBe('Read');
  });
});
