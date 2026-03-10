import { join } from 'node:path';
import { loadConfig } from './config/loader.js';
import { createLogger, type Logger } from './utils/logger.js';
import { createRunner } from './agent/runner.js';
import { LaneQueue } from './queue/lane-queue.js';
import { MemoryManager } from './memory/manager.js';
import { HistoryLogger } from './persistence/history.js';
import { SessionStore } from './persistence/sessions.js';
import { RegistrationManager } from './auth/registration.js';
import { CronManager } from './scheduler/cron-manager.js';
import { Heartbeat } from './scheduler/heartbeat.js';
import { TelegramAdapter } from './channel/telegram-adapter.js';
import { ChannelDispatcher } from './channel/dispatcher.js';
import { writeSoulToClaudeMd } from './agent/soul-writer.js';
import { APP_NAME, APP_VERSION, QUEUE_DRAIN_TIMEOUT_MS } from './utils/constants.js';
import type { SoulConfig } from './config/schema.js';

export interface DaemonContext {
  config: SoulConfig;
  logger: Logger;
  queue: LaneQueue;
  memory: MemoryManager;
  history: HistoryLogger;
  sessions: SessionStore;
  cronManager: CronManager;
  heartbeat: Heartbeat;
  dispatcher: ChannelDispatcher;
}

export async function startDaemon(configPath: string): Promise<DaemonContext> {
  // Load config
  const config = await loadConfig(configPath);
  const logger = createLogger(config.logging.level);

  logger.info(
    { version: APP_VERSION, configPath },
    `${APP_NAME} starting`,
  );

  // Initialize subsystems
  const memory = new MemoryManager(config.paths.dataDir);
  await memory.ensureDir();

  const history = new HistoryLogger(config.paths.dataDir);

  const sessions = new SessionStore(config.paths.dataDir);
  await sessions.load();
  logger.info('Session store loaded');

  // Write soul/personality to CLAUDE.md in agent's cwd
  await writeSoulToClaudeMd(config, logger);

  // Registration manager (auto-registration when allowedChatIds is empty)
  const registration = new RegistrationManager(
    join(config.paths.dataDir, 'registered-users.json'),
  );
  await registration.load();
  const useAutoReg = config.telegram.allowedChatIds.length === 0;
  if (useAutoReg) {
    logger.info('Auto-registration mode: first /start becomes owner');
  }

  const runner = createRunner(config);
  const queue = new LaneQueue(runner, config, memory, history, logger);

  // Start cron scheduler
  const cronManager = new CronManager(config, queue, logger);
  cronManager.start();
  logger.info({ jobCount: cronManager.jobCount }, 'Cron scheduler started');

  // Channel dispatcher
  const dispatcher = new ChannelDispatcher(
    config,
    queue,
    memory,
    history,
    sessions,
    logger,
    useAutoReg ? registration : undefined,
  );

  // Telegram channel
  const telegram = new TelegramAdapter(
    config,
    logger,
    useAutoReg ? registration : undefined,
  );
  dispatcher.addChannel(telegram);
  await telegram.start();

  // Wire telegram as the cron notify channel so results actually get sent
  cronManager.setNotifyChannel(telegram);

  // Conditionally start Twitter adapter
  if (config.twitter?.enabled) {
    try {
      const { TwitterAdapter } = await import('./channel/twitter-adapter.js');
      const twitter = new TwitterAdapter(
        {
          allowedUsernames: config.twitter.allowedUsernames,
          pollIntervalSeconds: config.twitter.pollIntervalSeconds,
        },
        logger,
      );
      dispatcher.addChannel(twitter);
      await twitter.start();
      logger.info('Twitter adapter started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Twitter adapter');
    }
  }

  // Conditionally start Discord adapter
  if (config.discord?.enabled) {
    try {
      const { DiscordAdapter } = await import('./channel/discord-adapter.js');
      const discord = new DiscordAdapter(
        { allowedChannelIds: config.discord.allowedChannelIds },
        logger,
      );
      dispatcher.addChannel(discord);
      await discord.start();
      logger.info('Discord adapter started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Discord adapter');
    }
  }

  // Conditionally start webhook server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webhookServer: any = null;
  if (config.webhooks?.enabled) {
    try {
      const { WebhookServer } = await import('./webhooks/server.js');
      webhookServer = new WebhookServer({
        port: config.webhooks.port,
        logger,
      });

      if (config.webhooks.github) {
        const { registerGitHubWebhook, buildGitHubPrompt } = await import('./webhooks/github.js');
        registerGitHubWebhook(
          webhookServer.fastify,
          config.webhooks.github,
          {
            onEvent: async (event) => {
              const prompt = buildGitHubPrompt(event);
              if (prompt) {
                const crypto = await import('node:crypto');
                queue.enqueue(
                  {
                    id: crypto.randomUUID(),
                    source: 'webhook',
                    prompt,
                    chatId: config.telegram.notifyChatId ?? 0,
                    messageId: 0,
                    createdAt: new Date().toISOString(),
                    channelType: 'telegram',
                    channelId: String(config.telegram.notifyChatId ?? ''),
                  },
                  async (result) => {
                    // Send result to notify chat if configured
                    const notifyChatId = config.telegram.notifyChatId;
                    if (notifyChatId) {
                      const { formatAgentResult } = await import('./telegram/formatter.js');
                      const text = formatAgentResult(result, config.telegram.maxMessageLength);
                      await telegram.sendMessage(String(notifyChatId), { text });
                    }
                  },
                );
              }
            },
          },
          logger,
        );
      }

      if (config.webhooks.generic) {
        const { registerGenericWebhook } = await import('./webhooks/generic.js');
        registerGenericWebhook(
          webhookServer.fastify,
          config.webhooks.generic,
          {
            onWebhook: async (payload) => {
              const prompt = String(payload.prompt ?? '');
              if (prompt) {
                const crypto = await import('node:crypto');
                queue.enqueue(
                  {
                    id: crypto.randomUUID(),
                    source: 'webhook',
                    prompt,
                    chatId: config.telegram.notifyChatId ?? 0,
                    messageId: 0,
                    createdAt: new Date().toISOString(),
                  },
                  async () => {},
                );
              }
            },
          },
          logger,
        );
      }

      await webhookServer.start();
      logger.info({ port: config.webhooks.port }, 'Webhook server started');
    } catch (err) {
      logger.error({ err }, 'Failed to start webhook server');
    }
  }

  // Heartbeat uses the raw bot
  const heartbeat = new Heartbeat(config, telegram.rawBot, queue, logger);
  heartbeat.start();

  logger.info(`${APP_NAME} v${APP_VERSION} is running`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    heartbeat.stop();
    logger.info('Heartbeat stopped');

    cronManager.stop();
    logger.info('Cron scheduler stopped');

    if (webhookServer) {
      await webhookServer.stop();
      logger.info('Webhook server stopped');
    }

    await telegram.stop();
    logger.info('Telegram bot stopped');

    const twitterCh = dispatcher.getChannel('twitter');
    if (twitterCh) {
      await twitterCh.stop();
      logger.info('Twitter adapter stopped');
    }
    const discordCh = dispatcher.getChannel('discord');
    if (discordCh) {
      await discordCh.stop();
      logger.info('Discord adapter stopped');
    }

    await queue.drain(QUEUE_DRAIN_TIMEOUT_MS);
    logger.info('Queue drained');

    logger.info(`${APP_NAME} stopped`);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return {
    config, logger, queue, memory, history, sessions, cronManager,
    heartbeat, dispatcher,
  };
}
