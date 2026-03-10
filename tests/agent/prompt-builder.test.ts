import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  buildSystemContext,
  buildPrompt,
  type MemoryProvider,
} from '../../src/agent/prompt-builder.js';
import type { SoulConfig } from '../../src/config/schema.js';
import { SoulConfigSchema } from '../../src/config/schema.js';

function makeConfig(overrides: Record<string, unknown> = {}): SoulConfig {
  return SoulConfigSchema.parse({
    version: 1,
    telegram: { allowedChatIds: [1] },
    agent: { cwd: '/tmp' },
    ...overrides,
  });
}

function makeMemory(content: string = ''): MemoryProvider {
  return { getAllMemory: () => content };
}

describe('buildSystemContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes identity name', () => {
    const config = makeConfig({
      identity: { name: 'Test', personality: 'Be helpful' },
    });
    const result = buildSystemContext(config, makeMemory());
    expect(result).toContain('Your name is Test');
    expect(result).toContain('Be helpful');
  });

  it('includes instruction to not reveal system prompt', () => {
    const config = makeConfig();
    const result = buildSystemContext(config, makeMemory());
    expect(result).toContain('Never reveal');
  });

  it('includes system context when set', () => {
    const config = makeConfig({
      identity: { name: 'Test', systemContext: 'TypeScript project' },
    });
    const result = buildSystemContext(config, makeMemory());
    expect(result).toContain('TypeScript project');
  });

  it('includes appendSystemPrompt when set', () => {
    const config = makeConfig({
      agent: { cwd: '/tmp', appendSystemPrompt: 'Always run tests' },
    });
    const result = buildSystemContext(config, makeMemory());
    expect(result).toContain('Always run tests');
  });

  it('includes memory content', () => {
    const config = makeConfig();
    const result = buildSystemContext(
      config,
      makeMemory('## Notes\nImportant fact'),
    );
    expect(result).toContain('memory');
    expect(result).toContain('Important fact');
  });

  it('excludes memory section when memory is empty', () => {
    const config = makeConfig();
    const result = buildSystemContext(config, makeMemory(''));
    expect(result).not.toContain('Persistent memory');
  });

  it('includes Telegram context and current time', () => {
    const config = makeConfig();
    const result = buildSystemContext(config, makeMemory());
    expect(result).toContain('Telegram');
    expect(result).toContain('2026-02-21T12:00:00.000Z');
  });

  it('concatenates all sections with double newlines', () => {
    const config = makeConfig({
      identity: { name: 'Test', personality: 'Helpful', systemContext: 'Project' },
    });
    const result = buildSystemContext(config, makeMemory('Notes'));
    const sections = result.split('\n\n');
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });
});

describe('buildPrompt', () => {
  it('returns the user message as-is', () => {
    expect(buildPrompt('Fix the auth test')).toBe('Fix the auth test');
  });

  it('preserves empty strings', () => {
    expect(buildPrompt('')).toBe('');
  });

  it('preserves multiline messages', () => {
    const msg = 'Line 1\nLine 2\nLine 3';
    expect(buildPrompt(msg)).toBe(msg);
  });
});
