import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  ProgressUpdate,
} from './types.js';
import type { Logger } from '../utils/logger.js';

const MAX_TWEET_LENGTH = 280;

export interface TwitterAdapterConfig {
  allowedUsernames: string[];
  pollIntervalSeconds: number;
}

/**
 * Twitter/X channel adapter using twitter-api-v2.
 * Uses mention polling to receive messages and tweet threads for responses.
 *
 * Required env vars:
 * - TWITTER_BEARER_TOKEN
 * - TWITTER_API_KEY
 * - TWITTER_API_SECRET
 * - TWITTER_ACCESS_TOKEN
 * - TWITTER_ACCESS_SECRET
 */
export class TwitterAdapter implements ChannelAdapter {
  readonly type = 'twitter';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler?: (msg: InboundMessage) => Promise<void>;
  private callbackHandler?: (
    channelId: string,
    userId: string,
    data: string,
    msgId: string,
  ) => Promise<void>;
  private lastMentionId?: string;

  constructor(
    private readonly config: TwitterAdapterConfig,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      throw new Error(
        'Twitter adapter requires TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_SECRET environment variables',
      );
    }

    try {
      const { TwitterApi } = await import('twitter-api-v2');
      this.client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken,
        accessSecret,
      });

      this.logger.info('Twitter adapter connected');

      // Start polling for mentions
      this.pollTimer = setInterval(
        () => this.pollMentions(),
        this.config.pollIntervalSeconds * 1000,
      );

      // Do an initial poll
      await this.pollMentions();
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Cannot find module') ||
          err.message.includes('twitter-api-v2'))
      ) {
        throw new Error(
          'Twitter adapter requires twitter-api-v2 package. Install with: pnpm add twitter-api-v2',
          { cause: err },
        );
      }
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger.info('Twitter adapter stopped');
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onCallback(
    handler: (
      channelId: string,
      userId: string,
      data: string,
      msgId: string,
    ) => Promise<void>,
  ): void {
    this.callbackHandler = handler;
  }

  async sendMessage(channelId: string, msg: OutboundMessage): Promise<string> {
    if (!this.client) throw new Error('Twitter client not initialized');

    const text = msg.text;
    if (text.length <= MAX_TWEET_LENGTH) {
      const tweet = await this.client.v2.reply(text, channelId);
      return String(tweet.data.id);
    }

    // Thread long responses
    return this.sendThread(channelId, text);
  }

  async editMessage(
    _channelId: string,
    _messageId: string,
    _msg: OutboundMessage,
  ): Promise<void> {
    // Twitter doesn't support editing tweets for bots in v2 API
    // Progress updates are skipped on Twitter
  }

  async sendProgress(
    _channelId: string,
    _update: ProgressUpdate,
  ): Promise<string> {
    // Twitter doesn't support progress updates (no edit)
    // Return empty string — dispatcher handles this gracefully
    return '';
  }

  async sendTypingIndicator(_channelId: string): Promise<void> {
    // No typing indicator on Twitter
  }

  /**
   * Split long text into a tweet thread.
   */
  private async sendThread(
    replyToId: string,
    text: string,
  ): Promise<string> {
    const chunks = this.splitIntoChunks(text, MAX_TWEET_LENGTH - 5); // Reserve space for "1/N "
    let lastId = replyToId;

    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `${i + 1}/${chunks.length} ` : '';
      const tweet = await this.client.v2.reply(prefix + chunks[i], lastId);
      lastId = String(tweet.data.id);
    }

    return lastId;
  }

  private splitIntoChunks(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (end of sentence, word boundary)
      let splitIdx = remaining.lastIndexOf('. ', maxLen);
      if (splitIdx < maxLen * 0.5) {
        splitIdx = remaining.lastIndexOf(' ', maxLen);
      }
      if (splitIdx < maxLen * 0.3) {
        splitIdx = maxLen;
      }

      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trimStart();
    }

    return chunks;
  }

  private async pollMentions(): Promise<void> {
    if (!this.client || !this.messageHandler) return;

    try {
      const params: Record<string, unknown> = {
        'tweet.fields': ['author_id', 'conversation_id', 'text'],
        expansions: ['author_id'],
      };
      if (this.lastMentionId) {
        params.since_id = this.lastMentionId;
      }

      const me = await this.client.v2.me();
      const mentions = await this.client.v2.userMentionTimeline(
        me.data.id,
        params,
      );

      if (!mentions.data?.data) return;

      for (const tweet of mentions.data.data) {
        this.lastMentionId = tweet.id;

        // Find username from includes
        const author = mentions.data.includes?.users?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (u: any) => u.id === tweet.author_id,
        );
        const username = author?.username ?? '';

        // Check allowlist
        if (
          this.config.allowedUsernames.length > 0 &&
          !this.config.allowedUsernames.includes(username)
        ) {
          this.logger.debug(
            { username, tweetId: tweet.id },
            'Ignoring mention from non-allowed user',
          );
          continue;
        }

        // Strip @mention from text
        const text = tweet.text
          .replace(new RegExp(`@${me.data.username}\\s*`, 'gi'), '')
          .trim();

        if (!text) continue;

        await this.messageHandler({
          channelType: 'twitter',
          channelId: tweet.id,
          userId: tweet.author_id,
          text,
        });
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to poll Twitter mentions');
    }
  }
}
