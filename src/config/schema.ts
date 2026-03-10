import { z } from 'zod/v4';

export const SoulConfigSchema = z.object({
  version: z.literal(1),

  identity: z
    .object({
      name: z.string().default('Hyphora'),
      personality: z.string().optional(),
      systemContext: z.string().optional(),
    })
    .default({ name: 'Hyphora' }),

  telegram: z.object({
    allowedChatIds: z.array(z.number()).default([]),
    notifyChatId: z.number().optional(),
    showProgress: z.boolean().default(true),
    maxMessageLength: z.number().default(4000),
    verbosity: z.number().min(0).max(2).default(1),
  }),

  agent: z
    .object({
      mode: z.enum(['sdk', 'cli']).default('cli'),
      model: z.string().default('sonnet'),
      cwd: z.string(),
      allowedTools: z
        .array(z.string())
        .default(['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep']),
      permissionMode: z
        .enum(['default', 'acceptEdits', 'god', 'bypassPermissions', 'plan'])
        .default('acceptEdits'),
      maxBudgetUsd: z.number().default(1.0),
      maxTurns: z.number().default(20),
      appendSystemPrompt: z.string().optional(),
      mcpServers: z.record(z.string(), z.unknown()).optional(),
    }),

  memory: z
    .object({
      files: z
        .array(z.string())
        .default(['general.md', 'decisions.md', 'learnings.md']),
      maxContextChars: z.number().default(8000),
    })
    .default({
      files: ['general.md', 'decisions.md', 'learnings.md'],
      maxContextChars: 8000,
    }),

  schedules: z
    .array(
      z.object({
        name: z.string(),
        cron: z.string(),
        prompt: z.string(),
        enabled: z.boolean().default(true),
        cwd: z.string().optional(),
        maxBudgetUsd: z.number().optional(),
      }),
    )
    .default([]),

  heartbeat: z
    .object({
      enabled: z.boolean().default(false),
      intervalMinutes: z.number().default(60),
    })
    .default({ enabled: false, intervalMinutes: 60 }),

  security: z
    .object({
      autoRegistration: z.boolean().default(false),
      allowedDirectories: z.array(z.string()).default([]),
      maxUploadSizeMb: z.number().default(50),
    })
    .default({ autoRegistration: false, allowedDirectories: [], maxUploadSizeMb: 50 }),

  webhooks: z
    .object({
      enabled: z.boolean().default(false),
      port: z.number().default(3000),
      github: z
        .object({
          secret: z.string(),
          events: z.array(z.string()).default(['pull_request', 'workflow_run', 'issues']),
        })
        .optional(),
      generic: z
        .object({
          bearerToken: z.string(),
        })
        .optional(),
    })
    .default({ enabled: false, port: 3000 }),

  twitter: z
    .object({
      enabled: z.boolean().default(false),
      allowedUsernames: z.array(z.string()).default([]),
      pollIntervalSeconds: z.number().default(30),
    })
    .default({ enabled: false, allowedUsernames: [], pollIntervalSeconds: 30 }),

  discord: z
    .object({
      enabled: z.boolean().default(false),
      allowedChannelIds: z.array(z.string()).default([]),
    })
    .default({ enabled: false, allowedChannelIds: [] }),

  costAlertUsd: z.number().optional(),

  paths: z
    .object({
      dataDir: z.string().default('./data'),
    })
    .default({ dataDir: './data' }),

  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    })
    .default({ level: 'info' as const }),
});

export type SoulConfig = z.infer<typeof SoulConfigSchema>;
