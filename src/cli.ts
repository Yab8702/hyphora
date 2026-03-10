import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { APP_NAME, APP_VERSION, DEFAULT_CONFIG_PATH } from './utils/constants.js';

function createPrompt(): {
  ask: (question: string, defaultValue?: string) => Promise<string>;
  close: () => void;
} {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string, defaultValue?: string) =>
      new Promise((resolve) => {
        const suffix = defaultValue ? ` [${defaultValue}]` : '';
        rl.question(`${question}${suffix}: `, (answer) => {
          resolve(answer.trim() || defaultValue || '');
        });
      }),
    close: () => rl.close(),
  };
}

/** Parse a .env file into a key→value map. */
function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

/** Merge new key=value pairs into existing .env content, preserving other lines. */
function mergeDotEnv(existing: string, updates: Record<string, string>): string {
  const lines = existing.split('\n');
  const handled = new Set<string>();

  const merged = lines.map((line) => {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return line;
    const key = line.slice(0, eqIdx).trim();
    if (key in updates) {
      handled.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append any new keys that weren't already in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      merged.push(`${key}=${value}`);
    }
  }

  return merged.join('\n');
}

export async function runInit(): Promise<void> {
  console.log(`\n${APP_NAME} v${APP_VERSION} — Setup\n`);
  console.log('No Telegram ID needed — just send /start after launch to register.\n');

  if (existsSync(DEFAULT_CONFIG_PATH)) {
    console.log(`Warning: ${DEFAULT_CONFIG_PATH} already exists.`);
    const prompt = createPrompt();
    const overwrite = await prompt.ask('Overwrite? (y/N)', 'N');
    prompt.close();
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
  }

  // Read existing .env for pre-filling
  let existingEnv: Record<string, string> = {};
  if (existsSync('.env')) {
    const raw = await readFile('.env', 'utf-8');
    existingEnv = parseDotEnv(raw);
  }

  const prompt = createPrompt();

  // 1. Bot token — pre-fill from .env if present
  const existingToken = existingEnv['TELEGRAM_BOT_TOKEN'];
  const botToken = await prompt.ask(
    'Telegram Bot Token (from @BotFather)',
    existingToken || undefined,
  );
  if (!botToken) {
    console.log('Bot token is required. Aborted.');
    prompt.close();
    return;
  }

  // 2. Agent name
  const agentName = await prompt.ask('Agent name', APP_NAME);

  // 3. Project directory
  const cwd = await prompt.ask('Project working directory', process.cwd());

  // 4. Agent mode
  const agentMode = await prompt.ask('Agent mode (sdk or cli)', 'cli');

  // 5. API key — only for sdk mode; cli never needs it
  let apiKey = '';
  if (agentMode === 'sdk') {
    const existingKey = existingEnv['ANTHROPIC_API_KEY'];
    apiKey = await prompt.ask(
      'Anthropic API Key (required for sdk mode)',
      existingKey || undefined,
    );
    if (!apiKey) {
      console.log('API key required for sdk mode. Aborted.');
      prompt.close();
      return;
    }
  }

  // 6. Budget
  const maxBudget = await prompt.ask('Max budget per task (USD)', '1.00');

  prompt.close();

  // Generate soul.yaml
  const soulYaml = `version: 1

identity:
  name: "${agentName}"
  personality: |
    Your name is ${agentName}. You are a senior software engineer assistant running 24/7.
    You are calm, direct, and practical. No fluff.
    You communicate via Telegram — keep messages concise but friendly.
    You can read files, edit code, run commands, and help with any coding task.

telegram:
  # Auto-registration: leave empty so first /start becomes owner automatically
  allowedChatIds: []

agent:
  mode: ${agentMode}
  model: sonnet
  cwd: "${cwd.replace(/\\/g, '/')}"
  maxBudgetUsd: ${maxBudget}
  maxTurns: 20
  allowedTools: [Read, Edit, Write, Bash, Glob, Grep]
  permissionMode: acceptEdits

memory:
  files: [general.md, decisions.md, learnings.md]
  maxContextChars: 8000

heartbeat:
  enabled: false
  intervalMinutes: 60

schedules: []

paths:
  dataDir: "./data"

logging:
  level: info
`;

  // Write soul.yaml
  await writeFile(DEFAULT_CONFIG_PATH, soulYaml, 'utf-8');
  console.log(`\n✓ Created ${DEFAULT_CONFIG_PATH}`);

  // Update or create .env
  const envUpdates: Record<string, string> = { TELEGRAM_BOT_TOKEN: botToken };
  if (apiKey) envUpdates['ANTHROPIC_API_KEY'] = apiKey;

  if (existsSync('.env')) {
    const raw = await readFile('.env', 'utf-8');
    const merged = mergeDotEnv(raw, envUpdates);
    await writeFile('.env', merged, 'utf-8');
    console.log('✓ Updated .env');
  } else {
    const envContent = Object.entries(envUpdates)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
    await writeFile('.env', envContent, 'utf-8');
    console.log('✓ Created .env');
  }

  console.log(`
Setup complete!

Next steps:
  1. Run: npx tsx src/index.ts
  2. Open Telegram and send /start to your bot
  3. You become the owner automatically — no chat ID needed

That's it.
`);
}
