import cron from 'node-cron';
import crypto from 'node:crypto';
import type { SoulConfig } from '../config/schema.js';
import type { LaneQueue } from '../queue/lane-queue.js';
import type { ChannelAdapter } from '../channel/types.js';
import type { Logger } from '../utils/logger.js';
import type { QueueTask } from '../queue/types.js';
import { formatAgentResult } from '../telegram/formatter.js';

interface ScheduledJob {
  name: string;
  task: cron.ScheduledTask;
}

export class CronManager {
  private jobs: ScheduledJob[] = [];
  private notifyChannel?: ChannelAdapter;

  constructor(
    private readonly config: SoulConfig,
    private readonly queue: LaneQueue,
    private readonly logger: Logger,
  ) {}

  /**
   * Set the channel to send cron results to (called after channel is ready).
   */
  setNotifyChannel(channel: ChannelAdapter): void {
    this.notifyChannel = channel;
  }

  start(): void {
    for (const schedule of this.config.schedules) {
      if (!schedule.enabled) {
        this.logger.info({ name: schedule.name }, 'Schedule disabled, skipping');
        continue;
      }

      if (!cron.validate(schedule.cron)) {
        this.logger.error(
          { name: schedule.name, cron: schedule.cron },
          'Invalid cron expression, skipping',
        );
        continue;
      }

      const task = cron.schedule(schedule.cron, () => {
        this.logger.info({ name: schedule.name }, 'Cron job triggered');
        this.enqueueScheduledTask(schedule);
      });

      this.jobs.push({ name: schedule.name, task });
      this.logger.info(
        { name: schedule.name, cron: schedule.cron },
        'Cron job registered',
      );
    }
  }

  stop(): void {
    for (const job of this.jobs) {
      job.task.stop();
      this.logger.info({ name: job.name }, 'Cron job stopped');
    }
    this.jobs = [];
  }

  get jobCount(): number {
    return this.jobs.length;
  }

  private enqueueScheduledTask(
    schedule: SoulConfig['schedules'][number],
  ): void {
    const task: QueueTask = {
      id: crypto.randomUUID(),
      source: 'cron',
      prompt: schedule.prompt,
      createdAt: new Date().toISOString(),
      cwd: schedule.cwd,
      maxBudgetUsd: schedule.maxBudgetUsd,
    };

    const chatId = this.config.telegram.notifyChatId;

    this.queue.enqueue(task, async (result) => {
      this.logger.info(
        { name: schedule.name, success: result.success },
        'Cron task completed',
      );

      // Send result to notify channel if configured
      if (chatId && this.notifyChannel) {
        try {
          const header = `Scheduled: "${schedule.name}" ${result.success ? '✓' : '✗'}\n\n`;
          const body = formatAgentResult(result, this.config.telegram.maxMessageLength - header.length);
          await this.notifyChannel.sendMessage(String(chatId), {
            text: header + body,
          });
        } catch (err) {
          this.logger.error({ err, name: schedule.name }, 'Failed to send cron result');
        }
      }
    });
  }
}
