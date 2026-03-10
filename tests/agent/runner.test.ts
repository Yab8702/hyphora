import { describe, it, expect } from 'vitest';
import { createRunner } from '../../src/agent/runner.js';
import { SdkAgentRunner } from '../../src/agent/sdk-runner.js';
import { CliAgentRunner } from '../../src/agent/cli-runner.js';
import { SoulConfigSchema } from '../../src/config/schema.js';

describe('createRunner', () => {
  it('returns SdkAgentRunner when mode is sdk', () => {
    const config = SoulConfigSchema.parse({
      version: 1,
      telegram: { allowedChatIds: [1] },
      agent: { cwd: '/tmp', mode: 'sdk' },
    });
    const runner = createRunner(config);
    expect(runner).toBeInstanceOf(SdkAgentRunner);
  });

  it('returns CliAgentRunner when mode is cli', () => {
    const config = SoulConfigSchema.parse({
      version: 1,
      telegram: { allowedChatIds: [1] },
      agent: { cwd: '/tmp', mode: 'cli' },
    });
    const runner = createRunner(config);
    expect(runner).toBeInstanceOf(CliAgentRunner);
  });

  it('defaults to CliAgentRunner when mode not specified', () => {
    const config = SoulConfigSchema.parse({
      version: 1,
      telegram: { allowedChatIds: [1] },
      agent: { cwd: '/tmp' },
    });
    const runner = createRunner(config);
    expect(runner).toBeInstanceOf(CliAgentRunner);
  });
});
