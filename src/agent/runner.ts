import type { AgentRunner } from './types.js';
import { SdkAgentRunner } from './sdk-runner.js';
import { CliAgentRunner } from './cli-runner.js';
import type { SoulConfig } from '../config/schema.js';

export function createRunner(config: SoulConfig): AgentRunner {
  if (config.agent.mode === 'sdk') {
    return new SdkAgentRunner();
  }
  return new CliAgentRunner();
}
