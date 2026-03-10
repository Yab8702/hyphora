import { describe, it, expect } from 'vitest';
import {
  formatProgressCompact,
  formatProgressEvent,
} from '../../src/agent/progress-formatter.js';
import type { ProgressEvent } from '../../src/agent/types.js';

describe('formatProgressCompact', () => {
  it('shows elapsed time when no events', () => {
    const result = formatProgressCompact([], 15000);
    expect(result).toContain('Working on it...');
    expect(result).toContain('15s');
  });

  it('shows tool counts when events present', () => {
    const events: ProgressEvent[] = [
      { type: 'tool_start', timestamp: 0, toolName: 'Read' },
      { type: 'tool_start', timestamp: 0, toolName: 'Read' },
      { type: 'tool_start', timestamp: 0, toolName: 'Edit' },
      { type: 'tool_start', timestamp: 0, toolName: 'Bash' },
      { type: 'tool_start', timestamp: 0, toolName: 'Bash' },
      { type: 'tool_start', timestamp: 0, toolName: 'Bash' },
    ];
    const result = formatProgressCompact(events, 30000);
    expect(result).toContain('Read(2)');
    expect(result).toContain('Edit');
    expect(result).toContain('Bash(3)');
    expect(result).toContain('30s');
  });

  it('shows tool name without count for single use', () => {
    const events: ProgressEvent[] = [
      { type: 'tool_start', timestamp: 0, toolName: 'Glob' },
    ];
    const result = formatProgressCompact(events, 5000);
    expect(result).toContain('Glob');
    expect(result).not.toContain('Glob(');
  });

  it('ignores non-tool events for compact summary', () => {
    const events: ProgressEvent[] = [
      { type: 'assistant_reply', timestamp: 0, text: 'thinking...' },
    ];
    const result = formatProgressCompact(events, 5000);
    expect(result).toContain('Working on it...');
  });
});

describe('formatProgressEvent', () => {
  it('returns null at verbosity 0', () => {
    const event: ProgressEvent = {
      type: 'tool_start',
      timestamp: 0,
      toolName: 'Read',
    };
    expect(formatProgressEvent(event, 0)).toBeNull();
  });

  it('shows tool name at verbosity 1', () => {
    const event: ProgressEvent = {
      type: 'tool_start',
      timestamp: 0,
      toolName: 'Read',
      toolInput: 'src/index.ts',
    };
    const result = formatProgressEvent(event, 1);
    expect(result).toContain('Using Read');
    expect(result).toContain('src/index.ts');
  });

  it('hides assistant reply at verbosity 1', () => {
    const event: ProgressEvent = {
      type: 'assistant_reply',
      timestamp: 0,
      text: 'Let me look at that...',
    };
    expect(formatProgressEvent(event, 1)).toBeNull();
  });

  it('shows assistant reply at verbosity 2', () => {
    const event: ProgressEvent = {
      type: 'assistant_reply',
      timestamp: 0,
      text: 'Let me look at that...',
    };
    const result = formatProgressEvent(event, 2);
    expect(result).toContain('Let me look');
  });

  it('shows thinking at verbosity 2', () => {
    const event: ProgressEvent = {
      type: 'assistant_thinking',
      timestamp: 0,
      text: 'Analyzing the code...',
    };
    const result = formatProgressEvent(event, 2);
    expect(result).toContain('Thinking');
    expect(result).toContain('Analyzing');
  });

  it('truncates long tool input', () => {
    const event: ProgressEvent = {
      type: 'tool_start',
      timestamp: 0,
      toolName: 'Write',
      toolInput: 'x'.repeat(200),
    };
    const result = formatProgressEvent(event, 1)!;
    expect(result.length).toBeLessThan(150);
  });
});
