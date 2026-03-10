import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { SoulConfigSchema, type SoulConfig } from './schema.js';
import { ConfigError } from '../utils/errors.js';

export async function loadConfig(configPath: string): Promise<SoulConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error reading config';
    throw new ConfigError(`Failed to read config file at ${configPath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown YAML parse error';
    throw new ConfigError(`Invalid YAML in ${configPath}: ${message}`);
  }

  const result = SoulConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Invalid config in ${configPath}:\n${issues}`);
  }

  return result.data;
}
