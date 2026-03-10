import { describe, it, expect } from 'vitest';
import {
  formatAgentResult,
  formatMeta,
  formatDuration,
  splitLongMessage,
  escapeMarkdown,
  formatCostSummary,
  formatElapsedTime,
} from '../../src/telegram/formatter.js';
import type { AgentResult } from '../../src/agent/types.js';

function makeResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    success: true,
    result: 'Task completed successfully.',
    sessionId: 'sess-1',
    durationMs: 5000,
    costUsd: 0.25,
    numTurns: 3,
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(120000)).toBe('2m 0s');
  });

  it('rounds to nearest second', () => {
    expect(formatDuration(1499)).toBe('1s');
    expect(formatDuration(1500)).toBe('2s');
  });
});

describe('formatMeta', () => {
  it('includes all fields when present', () => {
    const meta = formatMeta(makeResult());
    expect(meta).toContain('5s');
    expect(meta).toContain('$0.25');
    expect(meta).toContain('3 turns');
  });

  it('omits zero duration', () => {
    const meta = formatMeta(makeResult({ durationMs: 0 }));
    expect(meta).not.toContain('0ms');
  });

  it('omits zero cost', () => {
    const meta = formatMeta(makeResult({ costUsd: 0 }));
    expect(meta).not.toContain('$');
  });

  it('omits zero turns', () => {
    const meta = formatMeta(makeResult({ numTurns: 0 }));
    expect(meta).not.toContain('turns');
  });

  it('returns empty string when all zeros', () => {
    const meta = formatMeta(makeResult({ durationMs: 0, costUsd: 0, numTurns: 0 }));
    expect(meta).toBe('');
  });
});

describe('formatAgentResult', () => {
  it('includes Done for success', () => {
    const result = formatAgentResult(makeResult());
    expect(result).toContain('Done');
    expect(result).toContain('Task completed successfully.');
  });

  it('includes Error for failure', () => {
    const result = formatAgentResult(makeResult({ success: false, error: 'Something broke' }));
    expect(result).toContain('Error');
  });

  it('truncates long body', () => {
    const longBody = 'x'.repeat(5000);
    const result = formatAgentResult(makeResult({ result: longBody }), 4000);
    expect(result.length).toBeLessThanOrEqual(4000);
    expect(result).toContain('truncated');
  });

  it('shows error text when no result', () => {
    const result = formatAgentResult(makeResult({ result: '', error: 'Agent crashed' }));
    expect(result).toContain('Agent crashed');
  });

  it('shows "No output" when both empty', () => {
    const result = formatAgentResult(makeResult({ result: '', error: undefined }));
    expect(result).toContain('No output');
  });
});

describe('splitLongMessage', () => {
  it('returns single chunk for short messages', () => {
    const chunks = splitLongMessage('Hello world', 100);
    expect(chunks).toEqual(['Hello world']);
  });

  it('splits at newline boundaries', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4';
    const chunks = splitLongMessage(text, 15);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be within limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
  });

  it('splits at space when no newline available', () => {
    const text = 'word1 word2 word3 word4 word5';
    const chunks = splitLongMessage(text, 12);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('hard cuts when no good split point', () => {
    const text = 'a'.repeat(100);
    const chunks = splitLongMessage(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBe(30);
  });

  it('handles empty string', () => {
    const chunks = splitLongMessage('', 100);
    expect(chunks).toEqual(['']);
  });

  it('preserves all content across chunks', () => {
    const text = 'Hello world this is a test message that needs splitting';
    const chunks = splitLongMessage(text, 20);
    // Rejoin (trimStart may remove some whitespace)
    const rejoined = chunks.join(' ');
    // All words should be present
    for (const word of text.split(' ')) {
      expect(rejoined).toContain(word);
    }
  });
});

describe('escapeMarkdown', () => {
  it('escapes special characters', () => {
    expect(escapeMarkdown('hello_world')).toBe('hello\\_world');
    expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\]\\(url\\)');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeMarkdown('hello world')).toBe('hello world');
  });

  it('escapes multiple special chars', () => {
    const escaped = escapeMarkdown('`code` ~strike~ #tag');
    expect(escaped).toContain('\\`');
    expect(escaped).toContain('\\~');
    expect(escaped).toContain('\\#');
  });
});

describe('formatCostSummary', () => {
  it('formats cost and task count', () => {
    const summary = formatCostSummary(1.5, 10);
    expect(summary).toContain('$1.50');
    expect(summary).toContain('10 tasks');
  });

  it('uses singular for one task', () => {
    const summary = formatCostSummary(0.25, 1);
    expect(summary).toContain('1 task');
    expect(summary).not.toContain('tasks');
  });

  it('handles zero', () => {
    const summary = formatCostSummary(0, 0);
    expect(summary).toContain('$0.00');
    expect(summary).toContain('0 tasks');
  });
});

describe('formatElapsedTime', () => {
  it('formats elapsed time message', () => {
    const msg = formatElapsedTime(45000);
    expect(msg).toContain('45s');
    expect(msg).toContain('elapsed');
  });

  it('includes Working on it text', () => {
    const msg = formatElapsedTime(1000);
    expect(msg).toContain('Working on it');
  });
});
