import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/loader.js';
import { ConfigError } from '../../src/utils/errors.js';

const TEST_DIR = join(process.cwd(), '.test-config-loader');

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('loads a valid YAML config file', async () => {
    const configPath = join(TEST_DIR, 'soul.yaml');
    await writeFile(
      configPath,
      `
version: 1
telegram:
  allowedChatIds:
    - 123456789
agent:
  cwd: "/tmp/test"
`,
      'utf-8',
    );

    const config = await loadConfig(configPath);
    expect(config.version).toBe(1);
    expect(config.telegram.allowedChatIds).toEqual([123456789]);
    expect(config.agent.cwd).toBe('/tmp/test');
    expect(config.agent.mode).toBe('cli');
    expect(config.identity.name).toBe('Hyphora');
  });

  it('throws ConfigError for missing file', async () => {
    await expect(loadConfig(join(TEST_DIR, 'nonexistent.yaml'))).rejects.toThrow(
      ConfigError,
    );
  });

  it('throws ConfigError for invalid YAML', async () => {
    const configPath = join(TEST_DIR, 'bad.yaml');
    await writeFile(configPath, '{{{{invalid yaml', 'utf-8');

    await expect(loadConfig(configPath)).rejects.toThrow(ConfigError);
  });

  it('throws ConfigError for valid YAML but invalid schema', async () => {
    const configPath = join(TEST_DIR, 'invalid-schema.yaml');
    await writeFile(
      configPath,
      `
version: 99
telegram:
  allowedChatIds: "not-an-array"
`,
      'utf-8',
    );

    await expect(loadConfig(configPath)).rejects.toThrow(ConfigError);
  });

  it('loads config with all fields populated', async () => {
    const configPath = join(TEST_DIR, 'full.yaml');
    await writeFile(
      configPath,
      `
version: 1
identity:
  name: TestBot
  personality: Helpful assistant
  systemContext: A test project
telegram:
  allowedChatIds: [111, 222]
  notifyChatId: 111
  showProgress: false
  maxMessageLength: 3000
agent:
  mode: sdk
  model: opus
  cwd: /projects/test
  allowedTools: [Read, Write]
  permissionMode: bypassPermissions
  maxBudgetUsd: 5.0
  maxTurns: 50
  appendSystemPrompt: Always test.
memory:
  files: [custom.md]
  maxContextChars: 4000
schedules:
  - name: test-schedule
    cron: "0 * * * *"
    prompt: Run tests
    enabled: true
costAlertUsd: 20.0
paths:
  dataDir: ./custom-data
logging:
  level: debug
`,
      'utf-8',
    );

    const config = await loadConfig(configPath);
    expect(config.identity.name).toBe('TestBot');
    expect(config.agent.mode).toBe('sdk');
    expect(config.schedules).toHaveLength(1);
    expect(config.costAlertUsd).toBe(20.0);
  });

  it('preserves error details in ConfigError message', async () => {
    const configPath = join(TEST_DIR, 'missing-fields.yaml');
    await writeFile(
      configPath,
      `
version: 1
telegram: {}
agent: {}
`,
      'utf-8',
    );

    try {
      await loadConfig(configPath);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe('CONFIG_ERROR');
    }
  });
});
