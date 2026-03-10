import type { Bot } from 'grammy';
import type { SoulConfig } from '../config/schema.js';
import type { LaneQueue } from '../queue/lane-queue.js';
import type { Logger } from '../utils/logger.js';
import { APP_NAME, APP_VERSION } from '../utils/constants.js';
import { formatDuration } from '../telegram/formatter.js';

export class Heartbeat {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly startTime = Date.now();

  constructor(
    private readonly config: SoulConfig,
    private readonly bot: Bot,
    private readonly queue: LaneQueue,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (!this.config.heartbeat.enabled) return;

    const chatId = this.config.telegram.notifyChatId;
    if (!chatId) {
      this.logger.warn('Heartbeat enabled but no notifyChatId set');
      return;
    }

    const intervalMs = this.config.heartbeat.intervalMinutes * 60 * 1000;

    this.interval = setInterval(async () => {
      try {
        const uptime = formatDuration(Date.now() - this.startTime);
        const info = this.queue.getInfo();
        const status = info.status === 'idle' ? 'idle' : `processing (${info.queueLength} queued)`;

        await this.bot.api.sendMessage(
          chatId,
          `${APP_NAME} v${APP_VERSION} heartbeat\n` +
            `Status: ${status}\n` +
            `Uptime: ${uptime}`,
        );
      } catch (err) {
        this.logger.error({ err }, 'Heartbeat failed');
      }
    }, intervalMs);

    this.logger.info(
      { intervalMinutes: this.config.heartbeat.intervalMinutes },
      'Heartbeat started',
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
