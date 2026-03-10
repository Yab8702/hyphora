import { describe, it, expect } from 'vitest';
import { SoulConfigSchema } from '../../src/config/schema.js';

describe('SoulConfigSchema', () => {
  const minimalConfig = {
    version: 1 as const,
    telegram: {
      allowedChatIds: [123456789],
    },
    agent: {
      cwd: '/tmp/test',
    },
  };

  it('parses a minimal valid config with defaults', () => {
    const result = SoulConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.identity.name).toBe('Hyphora');
    expect(result.data.agent.mode).toBe('cli');
    expect(result.data.agent.model).toBe('sonnet');
    expect(result.data.agent.maxBudgetUsd).toBe(1.0);
    expect(result.data.agent.maxTurns).toBe(20);
    expect(result.data.agent.permissionMode).toBe('acceptEdits');
    expect(result.data.agent.allowedTools).toEqual([
      'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
    ]);
    expect(result.data.memory.files).toEqual([
      'general.md', 'decisions.md', 'learnings.md',
    ]);
    expect(result.data.memory.maxContextChars).toBe(8000);
    expect(result.data.schedules).toEqual([]);
    expect(result.data.paths.dataDir).toBe('./data');
    expect(result.data.logging.level).toBe('info');
    expect(result.data.telegram.showProgress).toBe(true);
    expect(result.data.telegram.maxMessageLength).toBe(4000);
  });

  it('parses a full config', () => {
    const full = {
      version: 1 as const,
      identity: {
        name: 'TestBot',
        personality: 'Helpful',
        systemContext: 'Test project',
      },
      telegram: {
        allowedChatIds: [111, 222],
        notifyChatId: 111,
        showProgress: false,
        maxMessageLength: 3000,
      },
      agent: {
        mode: 'sdk' as const,
        model: 'opus',
        cwd: '/projects/myapp',
        allowedTools: ['Read', 'Write'],
        permissionMode: 'bypassPermissions' as const,
        maxBudgetUsd: 5.0,
        maxTurns: 50,
        appendSystemPrompt: 'Always run tests.',
        mcpServers: { test: { url: 'http://localhost:3000' } },
      },
      memory: {
        files: ['custom.md'],
        maxContextChars: 4000,
      },
      schedules: [
        {
          name: 'nightly',
          cron: '0 2 * * *',
          prompt: 'Run tests',
          enabled: true,
          cwd: '/other/dir',
          maxBudgetUsd: 2.0,
        },
      ],
      costAlertUsd: 25.0,
      paths: { dataDir: './custom-data' },
      logging: { level: 'debug' as const },
    };

    const result = SoulConfigSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.identity.name).toBe('TestBot');
    expect(result.data.agent.mode).toBe('sdk');
    expect(result.data.agent.model).toBe('opus');
    expect(result.data.schedules).toHaveLength(1);
    expect(result.data.schedules[0].name).toBe('nightly');
    expect(result.data.costAlertUsd).toBe(25.0);
    expect(result.data.paths.dataDir).toBe('./custom-data');
    expect(result.data.logging.level).toBe('debug');
  });

  it('rejects invalid version', () => {
    const result = SoulConfigSchema.safeParse({
      ...minimalConfig,
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it('allows missing telegram.allowedChatIds (defaults to empty for auto-registration)', () => {
    const result = SoulConfigSchema.safeParse({
      version: 1,
      telegram: {},
      agent: { cwd: '/tmp' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.telegram.allowedChatIds).toEqual([]);
  });

  it('rejects missing agent.cwd', () => {
    const result = SoulConfigSchema.safeParse({
      version: 1,
      telegram: { allowedChatIds: [1] },
      agent: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid agent.mode', () => {
    const result = SoulConfigSchema.safeParse({
      ...minimalConfig,
      agent: { ...minimalConfig.agent, mode: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid logging level', () => {
    const result = SoulConfigSchema.safeParse({
      ...minimalConfig,
      logging: { level: 'verbose' },
    });
    expect(result.success).toBe(false);
  });

  it('allows empty schedules', () => {
    const result = SoulConfigSchema.safeParse({
      ...minimalConfig,
      schedules: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates schedule objects', () => {
    const result = SoulConfigSchema.safeParse({
      ...minimalConfig,
      schedules: [{ name: 'test' }], // missing cron and prompt
    });
    expect(result.success).toBe(false);
  });

  it('allows costAlertUsd to be optional', () => {
    const result = SoulConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.costAlertUsd).toBeUndefined();
  });

  it('defaults telegram verbosity to 1', () => {
    const result = SoulConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.telegram.verbosity).toBe(1);
  });

  it('rejects telegram verbosity out of range', () => {
    const result = SoulConfigSchema.safeParse({
      ...minimalConfig,
      telegram: { ...minimalConfig.telegram, verbosity: 5 },
    });
    expect(result.success).toBe(false);
  });
});
