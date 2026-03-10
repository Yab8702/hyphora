import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ChannelAdapter, InboundMessage } from './types.js';
import type { SoulConfig } from '../config/schema.js';
import type { LaneQueue } from '../queue/lane-queue.js';
import type { MemoryManager } from '../memory/manager.js';
import type { HistoryLogger } from '../persistence/history.js';
import type { SessionStore } from '../persistence/sessions.js';
import type { RegistrationManager } from '../auth/registration.js';
import type { Logger } from '../utils/logger.js';
import { writeSoulToClaudeMd } from '../agent/soul-writer.js';
import { DEFAULT_CONFIG_PATH } from '../utils/constants.js';
import {
  formatCostSummary,
  formatDuration,
} from '../telegram/formatter.js';
import {
  APP_NAME,
  APP_VERSION,
} from '../utils/constants.js';

// God mode toggle per channel+user
const godModeUsers = new Set<string>();

function godKey(channelType: string, userId: string): string {
  return `${channelType}:${userId}`;
}

export function isGodMode(channelType: string, userId: string): boolean {
  return godModeUsers.has(godKey(channelType, userId));
}

export interface CommandContext {
  channel: ChannelAdapter;
  config: SoulConfig;
  queue: LaneQueue;
  memory: MemoryManager;
  history: HistoryLogger;
  sessions: SessionStore;
  registration?: RegistrationManager;
  logger: Logger;
}

export type CommandResult = { handled: boolean };

/**
 * Handle slash commands from any channel.
 * Returns { handled: true } if the message was a command.
 */
export async function handleCommand(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<CommandResult> {
  const text = msg.text.trim();

  // Check for command prefix
  if (!text.startsWith('/')) {
    return { handled: false };
  }

  const [rawCmd] = text.split(/\s+/);
  // Strip bot mention suffix (e.g. /start@mybot)
  const cmd = rawCmd.replace(/@\S+$/, '').toLowerCase();
  const argText = text.slice(rawCmd.length).trim();

  switch (cmd) {
    case '/start':
      await cmdStart(msg, ctx);
      return { handled: true };

    case '/help':
      await cmdHelp(msg, ctx);
      return { handled: true };

    case '/status':
      await cmdStatus(msg, ctx);
      return { handled: true };

    case '/memory':
      await cmdMemory(msg, argText, ctx);
      return { handled: true };

    case '/history':
      await cmdHistory(msg, ctx);
      return { handled: true };

    case '/cancel':
      await cmdCancel(msg, ctx);
      return { handled: true };

    case '/cost':
      await cmdCost(msg, ctx);
      return { handled: true };

    case '/god':
      await cmdGod(msg, ctx);
      return { handled: true };

    case '/name':
      await cmdName(msg, argText, ctx);
      return { handled: true };

    case '/ask':
    case '/task':
      // These are just prefixes for regular messages — not handled as commands
      return { handled: false };

    default:
      return { handled: false };
  }
}

async function cmdStart(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const name = ctx.config.identity.name;

  // Handle auto-registration
  if (ctx.registration) {
    const { isOwner, alreadyRegistered } = await ctx.registration.register(
      msg.channelType,
      msg.userId,
      msg.channelId,
    );

    if (alreadyRegistered) {
      await ctx.channel.sendMessage(msg.channelId, {
        text:
          `Welcome back! You're already registered${isOwner ? ' as owner' : ''}.\n\n` +
          `Send /help to see available commands.`,
      });
      return;
    }

    if (isOwner) {
      await ctx.channel.sendMessage(msg.channelId, {
        text:
          `Welcome, ${name} is ready!\n\n` +
          `You're the owner of this instance. You have full access.\n\n` +
          `Send /help to see all commands, or just start chatting.`,
      });
      return;
    }

    await ctx.channel.sendMessage(msg.channelId, {
      text:
        `You're now registered! Welcome.\n\n` +
          `Send /help to see available commands, or just start chatting.`,
    });
    return;
  }

  // No registration manager — standard help
  await cmdHelp(msg, ctx);
}

async function cmdHelp(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const name = ctx.config.identity.name;
  await ctx.channel.sendMessage(msg.channelId, {
    text:
      `Welcome to ${name} (${APP_NAME} v${APP_VERSION})!\n\n` +
      `I'm your AI coding assistant. Send me any message and I'll route it to Claude Code.\n\n` +
      `Commands:\n` +
      `/ask <prompt> - Ask Claude to do something\n` +
      `/god - Toggle God Mode (full permissions on/off)\n` +
      `/name <name> - Rename your agent\n` +
      `/status - Check current task status\n` +
      `/memory - View persistent memory\n` +
      `/memory add <text> - Save to memory\n` +
      `/history - Recent task history\n` +
      `/cancel - Cancel running task\n` +
      `/cost - Total spending\n` +
      `/help - This message`,
  });
}

async function cmdStatus(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const info = ctx.queue.getInfo();

  if (info.status === 'idle') {
    await ctx.channel.sendMessage(msg.channelId, {
      text: 'Status: idle\nNo tasks running or queued.',
    });
    return;
  }

  const lines = [`Status: ${info.status}`];
  if (info.currentTaskId) {
    lines.push(
      `Current task: ${info.currentTaskId} (${formatDuration(info.elapsedMs)} elapsed)`,
    );
  }
  lines.push(`Queue: ${info.queueLength} pending`);

  await ctx.channel.sendMessage(msg.channelId, {
    text: lines.join('\n'),
  });
}

async function cmdMemory(
  msg: InboundMessage,
  argText: string,
  ctx: CommandContext,
): Promise<void> {
  const addMatch = argText.match(/^add\s+(.+)/s);

  if (addMatch) {
    const content = addMatch[1].trim();
    if (!content) {
      await ctx.channel.sendMessage(msg.channelId, {
        text: 'Usage: /memory add <text to remember>',
      });
      return;
    }
    await ctx.memory.append('general.md', content);
    await ctx.channel.sendMessage(msg.channelId, {
      text: 'Saved to memory.',
    });
    return;
  }

  const memoryContent = ctx.memory.getAllMemory(
    ctx.config.telegram.maxMessageLength - 200,
    ctx.config.memory.files,
  );

  if (!memoryContent) {
    await ctx.channel.sendMessage(msg.channelId, {
      text: 'Memory is empty. Use /memory add <text> to save something.',
    });
    return;
  }

  await ctx.channel.sendMessage(msg.channelId, { text: memoryContent });
}

async function cmdHistory(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const recent = await ctx.history.getRecent(5);

  if (recent.length === 0) {
    await ctx.channel.sendMessage(msg.channelId, { text: 'No history yet.' });
    return;
  }

  const lines = recent.map((entry, i) => {
    const status = entry.success ? 'OK' : 'FAIL';
    const cost = entry.costUsd > 0 ? ` $${entry.costUsd.toFixed(2)}` : '';
    const duration =
      entry.durationMs > 0 ? ` ${formatDuration(entry.durationMs)}` : '';
    const prompt =
      entry.prompt.length > 60
        ? entry.prompt.slice(0, 60) + '...'
        : entry.prompt;
    return `${i + 1}. [${status}] ${prompt}${cost}${duration}`;
  });

  await ctx.channel.sendMessage(msg.channelId, {
    text: `Recent tasks:\n${lines.join('\n')}`,
  });
}

async function cmdCancel(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const cancelled = ctx.queue.cancelCurrent();
  await ctx.channel.sendMessage(msg.channelId, {
    text: cancelled
      ? 'Cancelling current task...'
      : 'No task is currently running.',
  });
}

async function cmdCost(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const totalCost = await ctx.history.getTotalCost();
  const count = await ctx.history.getCount();
  await ctx.channel.sendMessage(msg.channelId, {
    text: formatCostSummary(totalCost, count),
  });
}

async function cmdGod(
  msg: InboundMessage,
  ctx: CommandContext,
): Promise<void> {
  const key = godKey(msg.channelType, msg.userId);
  if (godModeUsers.has(key)) {
    godModeUsers.delete(key);
    await ctx.channel.sendMessage(msg.channelId, {
      text: 'God Mode OFF.\n\nClaude Code will now ask permission for risky actions.',
    });
  } else {
    godModeUsers.add(key);
    await ctx.channel.sendMessage(msg.channelId, {
      text:
        'God Mode ON.\n\n' +
        'Claude Code now has full unrestricted access — no permission prompts.\n' +
        'All your messages will run in God Mode until you send /god again.',
    });
  }
}

async function cmdName(
  msg: InboundMessage,
  argText: string,
  ctx: CommandContext,
): Promise<void> {
  const newName = argText.trim();

  if (!newName) {
    await ctx.channel.sendMessage(msg.channelId, {
      text:
        `Current name: ${ctx.config.identity.name}\n\n` +
        'Usage: /name <new name>\nExample: /name Jarvis',
    });
    return;
  }

  const oldName = ctx.config.identity.name;
  ctx.config.identity.name = newName;

  try {
    await writeSoulToClaudeMd(ctx.config, ctx.logger);
    await persistNameToSoulYaml(newName, ctx.logger);
    // Clear session so next message starts fresh with new identity
    await ctx.sessions.clear(Number(msg.channelId));
    await ctx.channel.sendMessage(msg.channelId, {
      text: `Renamed from "${oldName}" to "${newName}".\n\nI'll now introduce myself as ${newName}.`,
    });
  } catch (err) {
    ctx.config.identity.name = oldName;
    ctx.logger.error({ err }, 'Failed to update name');
    await ctx.channel.sendMessage(msg.channelId, {
      text: 'Failed to update name. Please try again.',
    });
  }
}

/**
 * Updates the name field in soul.yaml so it persists across restarts.
 * Does a targeted string replacement to avoid needing a YAML serializer.
 */
async function persistNameToSoulYaml(newName: string, logger: Logger): Promise<void> {
  if (!existsSync(DEFAULT_CONFIG_PATH)) return;
  const raw = await readFile(DEFAULT_CONFIG_PATH, 'utf-8');
  // Replace: name: "OldName"  (under the identity section)
  const updated = raw.replace(/^(\s*name:\s*)"[^"]*"/m, `$1"${newName}"`);
  if (updated !== raw) {
    await writeFile(DEFAULT_CONFIG_PATH, updated, 'utf-8');
    logger.info({ name: newName }, 'Name persisted to soul.yaml');
  }
}
