import crypto from 'node:crypto';
import type { ChannelAdapter, InboundMessage } from './types.js';
import type { SoulConfig } from '../config/schema.js';
import type { LaneQueue } from '../queue/lane-queue.js';
import type { MemoryManager } from '../memory/manager.js';
import type { HistoryLogger } from '../persistence/history.js';
import type { SessionStore } from '../persistence/sessions.js';
import type { RegistrationManager } from '../auth/registration.js';
import type { Logger } from '../utils/logger.js';
import type { QueueTask } from '../queue/types.js';
import type { AgentResult, ProgressEvent } from '../agent/types.js';
import { handleCommand, isGodMode } from './command-handler.js';
import {
  formatAgentResult,
} from '../telegram/formatter.js';
import {
  SESSION_CONTINUATION_WINDOW_MS,
  TYPING_INDICATOR_INTERVAL_MS,
  PROGRESS_THROTTLE_MS,
} from '../utils/constants.js';
import { formatProgressCompact } from '../agent/progress-formatter.js';

export class ChannelDispatcher {
  private readonly channels = new Map<string, ChannelAdapter>();

  constructor(
    private readonly config: SoulConfig,
    private readonly queue: LaneQueue,
    private readonly memory: MemoryManager,
    private readonly history: HistoryLogger,
    private readonly sessions: SessionStore,
    private readonly logger: Logger,
    private readonly registration?: RegistrationManager,
  ) {}

  addChannel(channel: ChannelAdapter): void {
    this.channels.set(channel.type, channel);

    channel.onMessage((msg) => this.handleMessage(channel, msg));
    channel.onCallback((channelId, userId, data, msgId) =>
      this.handleCallback(channel, channelId, userId, data, msgId),
    );
  }

  getChannel(type: string): ChannelAdapter | undefined {
    return this.channels.get(type);
  }

  private async handleMessage(
    channel: ChannelAdapter,
    msg: InboundMessage,
  ): Promise<void> {
    // Try command handling first
    const cmdCtx = {
      channel,
      config: this.config,
      queue: this.queue,
      memory: this.memory,
      history: this.history,
      sessions: this.sessions,
      registration: this.registration,
      logger: this.logger,
    };

    const result = await handleCommand(msg, cmdCtx);
    if (result.handled) return;

    // Not a command — treat as a task
    await this.enqueueTask(channel, msg);
  }

  private async handleCallback(
    _channel: ChannelAdapter,
    _channelId: string,
    _userId: string,
    _data: string,
    _msgId: string,
  ): Promise<void> {
    // Placeholder for future permission broker buttons
    this.logger.debug({ _data }, 'Callback query received');
  }

  private async enqueueTask(
    channel: ChannelAdapter,
    msg: InboundMessage,
  ): Promise<void> {
    // Strip command prefix if present
    const prompt = msg.text.replace(/^\/(?:ask|task)\s*/, '').trim();
    if (!prompt) {
      await channel.sendMessage(msg.channelId, {
        text: 'Usage: /ask <your question or task>',
      });
      return;
    }

    // Send acknowledgment
    const statusMsgId = await channel.sendMessage(msg.channelId, {
      text: 'Queued. Working on it...',
    });

    // Check session continuation
    const chatId = Number(msg.channelId);
    let sessionId: string | undefined;
    const lastSession = this.sessions.get(chatId);
    if (
      lastSession &&
      Date.now() - lastSession.timestamp < SESSION_CONTINUATION_WINDOW_MS
    ) {
      sessionId = lastSession.sessionId;
      this.logger.info({ chatId, sessionId }, 'Resuming previous session');
    }

    // Start typing indicator
    const typingInterval = setInterval(async () => {
      await channel.sendTypingIndicator(msg.channelId);
    }, TYPING_INDICATOR_INTERVAL_MS);

    // Progress tracking for streaming
    const progressEvents: ProgressEvent[] = [];
    let lastProgressUpdate = 0;
    const startTime = Date.now();

    // Elapsed time updates (fallback when no streaming)
    const elapsedInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const progressText = formatProgressCompact(progressEvents, elapsed);
      try {
        await channel.editMessage(msg.channelId, statusMsgId, {
          text: progressText,
        });
      } catch {
        // Ignore edit errors
      }
    }, PROGRESS_THROTTLE_MS);

    // Progress callback for streaming
    const onProgress = (event: ProgressEvent) => {
      progressEvents.push(event);

      // Throttle progress updates
      const now = Date.now();
      if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS) return;
      lastProgressUpdate = now;

      const elapsed = Date.now() - startTime;
      const text = formatProgressCompact(progressEvents, elapsed);
      channel
        .editMessage(msg.channelId, statusMsgId, { text })
        .catch(() => {});
    };

    // Check god mode
    const godMode = isGodMode(msg.channelType, msg.userId);

    const task: QueueTask = {
      id: crypto.randomUUID(),
      source: msg.channelType === 'telegram' ? 'telegram' : 'webhook',
      prompt,
      chatId,
      messageId: Number(statusMsgId),
      createdAt: new Date().toISOString(),
      sessionId,
      permissionMode: godMode ? 'god' : undefined,
      channelType: msg.channelType,
      channelId: msg.channelId,
      onProgress,
    };

    this.queue.enqueue(task, async (result: AgentResult) => {
      clearInterval(typingInterval);
      clearInterval(elapsedInterval);

      // Save session
      if (result.sessionId) {
        await this.sessions.set(chatId, result.sessionId);
      }

      // Send result
      const formatted = formatAgentResult(
        result,
        this.config.telegram.maxMessageLength,
      );

      try {
        await channel.editMessage(msg.channelId, statusMsgId, {
          text: formatted,
        });
      } catch (err) {
        this.logger.error(
          { err, taskId: task.id },
          'Failed to edit result message',
        );
        try {
          await channel.sendMessage(msg.channelId, {
            text: formatted.slice(0, 4000),
          });
        } catch {
          // Last resort failed
        }
      }

      // Cost alert
      if (
        this.config.costAlertUsd &&
        result.costUsd > 0 &&
        result.costUsd > this.config.costAlertUsd * 0.5
      ) {
        try {
          await channel.sendMessage(msg.channelId, {
            text:
              `Budget alert: This task cost $${result.costUsd.toFixed(2)}. ` +
              `Your alert threshold is $${this.config.costAlertUsd.toFixed(2)}.`,
          });
        } catch {
          // Ignore
        }
      }
    });
  }
}
