import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  ProgressUpdate,
} from './types.js';
import type { Logger } from '../utils/logger.js';

const MAX_DISCORD_MSG_LENGTH = 2000;
const MAX_EMBED_DESCRIPTION = 4096;

export interface DiscordAdapterConfig {
  allowedChannelIds: string[];
}

/**
 * Discord channel adapter using discord.js.
 * Uses rich embeds for long responses (Discord max 2000 chars, embed max 4096).
 *
 * Required env var: DISCORD_BOT_TOKEN
 */
export class DiscordAdapter implements ChannelAdapter {
  readonly type = 'discord';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private messageHandler?: (msg: InboundMessage) => Promise<void>;
  private callbackHandler?: (
    channelId: string,
    userId: string,
    data: string,
    msgId: string,
  ) => Promise<void>;

  constructor(
    private readonly config: DiscordAdapterConfig,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'Discord adapter requires DISCORD_BOT_TOKEN environment variable',
      );
    }

    try {
      const { Client, GatewayIntentBits } = await import('discord.js');

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on('messageCreate', async (message: any) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check channel allowlist
        if (
          this.config.allowedChannelIds.length > 0 &&
          !this.config.allowedChannelIds.includes(message.channel.id)
        ) {
          return;
        }

        // Check if bot is mentioned or message is in allowed channel
        const botMentioned =
          message.mentions.users.has(this.client.user?.id) ||
          this.config.allowedChannelIds.includes(message.channel.id);

        if (!botMentioned) return;

        // Strip bot mention from text
        const text = message.content
          .replace(/<@!?\d+>/g, '')
          .trim();

        if (!text) return;

        if (this.messageHandler) {
          await this.messageHandler({
            channelType: 'discord',
            channelId: message.channel.id,
            userId: message.author.id,
            text,
          });
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on('interactionCreate', async (interaction: any) => {
        if (!interaction.isButton()) return;
        if (this.callbackHandler) {
          await this.callbackHandler(
            interaction.channel.id,
            interaction.user.id,
            interaction.customId,
            interaction.message.id,
          );
          await interaction.deferUpdate();
        }
      });

      await this.client.login(token);
      this.logger.info('Discord adapter connected');
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Cannot find module') ||
          err.message.includes('discord.js'))
      ) {
        throw new Error(
          'Discord adapter requires discord.js package. Install with: pnpm add discord.js',
          { cause: err },
        );
      }
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.logger.info('Discord adapter stopped');
    }
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
    if (!this.client) throw new Error('Discord client not initialized');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Channel ${channelId} is not a text channel`);
    }

    const text = msg.text;

    // Short messages: send as plain text
    if (text.length <= MAX_DISCORD_MSG_LENGTH) {
      const sent = await channel.send(text);
      return String(sent.id);
    }

    // Long messages: use embed
    const { EmbedBuilder } = await import('discord.js');

    if (text.length <= MAX_EMBED_DESCRIPTION) {
      const embed = new EmbedBuilder()
        .setDescription(text)
        .setColor(0x7c3aed); // Purple

      const sent = await channel.send({ embeds: [embed] });
      return String(sent.id);
    }

    // Very long messages: split into multiple embeds
    const chunks = this.splitText(text, MAX_EMBED_DESCRIPTION);
    let lastId = '';

    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setDescription(chunks[i])
        .setColor(0x7c3aed)
        .setFooter({
          text: chunks.length > 1 ? `Part ${i + 1}/${chunks.length}` : '',
        });

      const sent = await channel.send({ embeds: [embed] });
      lastId = String(sent.id);
    }

    return lastId;
  }

  async editMessage(
    channelId: string,
    messageId: string,
    msg: OutboundMessage,
  ): Promise<void> {
    if (!this.client) return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) return;

      const message = await channel.messages.fetch(messageId);
      const text = msg.text;

      if (text.length <= MAX_DISCORD_MSG_LENGTH) {
        await message.edit(text);
      } else {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(text.slice(0, MAX_EMBED_DESCRIPTION))
          .setColor(0x7c3aed);
        await message.edit({ content: '', embeds: [embed] });
      }
    } catch (err) {
      this.logger.debug({ err, messageId }, 'Failed to edit Discord message');
    }
  }

  async sendProgress(
    channelId: string,
    update: ProgressUpdate,
  ): Promise<string> {
    if (update.replaceMessageId) {
      await this.editMessage(channelId, update.replaceMessageId, {
        text: update.text,
      });
      return update.replaceMessageId;
    }

    return this.sendMessage(channelId, { text: update.text });
  }

  async sendTypingIndicator(channelId: string): Promise<void> {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        await channel.sendTyping();
      }
    } catch {
      // Ignore typing indicator errors
    }
  }

  private splitText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      let splitIdx = remaining.lastIndexOf('\n', maxLen);
      if (splitIdx < maxLen * 0.3) {
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
}
