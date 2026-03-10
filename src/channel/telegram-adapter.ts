import { Bot } from 'grammy';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  ProgressUpdate,
  Attachment,
} from './types.js';
import type { SoulConfig } from '../config/schema.js';
import type { Logger } from '../utils/logger.js';
import type { RegistrationManager } from '../auth/registration.js';
import { authMiddleware, autoRegistrationMiddleware } from '../telegram/middleware.js';
import { splitLongMessage } from '../telegram/formatter.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram';
  private bot: Bot;
  private messageHandler?: (msg: InboundMessage) => Promise<void>;
  private callbackHandler?: (
    channelId: string,
    userId: string,
    callbackData: string,
    messageId: string,
  ) => Promise<void>;

  constructor(
    private readonly config: SoulConfig,
    private readonly logger: Logger,
    private readonly registration?: RegistrationManager,
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'TELEGRAM_BOT_TOKEN not set. Run `hyphora init` or set it in .env',
      );
    }
    this.bot = new Bot(token);
  }

  async start(): Promise<void> {
    // Auth middleware: use allowlist if provided, otherwise auto-registration
    const allowedIds = this.config.telegram.allowedChatIds;
    if (allowedIds.length > 0) {
      this.bot.use(authMiddleware(allowedIds));
    } else if (this.registration) {
      this.bot.use(autoRegistrationMiddleware(this.registration));
    } else {
      // No allowlist and no registration — warn but allow through (open mode)
      this.logger.warn(
        'No allowedChatIds and no registration manager — bot is open to everyone',
      );
    }

    // Handle callback queries (inline buttons)
    this.bot.on('callback_query:data', async (ctx) => {
      if (!this.callbackHandler) return;
      const chatId = String(ctx.chat?.id ?? '');
      const userId = String(ctx.from?.id ?? '');
      const data = ctx.callbackQuery.data;
      const msgId = String(ctx.callbackQuery.message?.message_id ?? '');
      await ctx.answerCallbackQuery();
      await this.callbackHandler(chatId, userId, data, msgId);
    });

    // Handle photo messages
    this.bot.on('message:photo', async (ctx) => {
      if (!this.messageHandler) return;
      const photos = ctx.message.photo;
      if (!photos || photos.length === 0) return;

      const photo = photos[photos.length - 1];
      try {
        const attachment = await this.downloadTelegramFile(
          photo.file_id,
          'image',
        );
        const caption = ctx.message.caption ?? '';
        const text = caption
          ? `The user sent an image. Read the image file at "${attachment.localPath}" to see it. Their message: ${caption}`
          : `The user sent an image. Read the image file at "${attachment.localPath}" to see it and describe what you see.`;

        await this.messageHandler({
          channelType: 'telegram',
          channelId: String(ctx.chat.id),
          userId: String(ctx.from?.id ?? ''),
          messageId: String(ctx.message.message_id),
          text,
          attachments: [attachment],
        });
      } catch (err) {
        this.logger.error({ err }, 'Failed to process Telegram photo');
        await ctx.reply('Failed to process the image. Please try again.');
      }
    });

    // Handle document uploads
    this.bot.on('message:document', async (ctx) => {
      if (!this.messageHandler) return;
      const doc = ctx.message.document;
      if (!doc) return;

      try {
        const ext = doc.file_name?.split('.').pop()?.toLowerCase() ?? '';
        const isArchive = ['zip', 'tar', 'gz', 'tgz'].includes(ext);
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
        const type = isArchive ? 'archive' : isImage ? 'image' : 'document';

        const attachment = await this.downloadTelegramFile(
          doc.file_id,
          type,
          doc.file_name,
        );
        const caption = ctx.message.caption ?? '';
        const text = caption
          ? `The user uploaded a file at "${attachment.localPath}". Their message: ${caption}`
          : `The user uploaded a file at "${attachment.localPath}". Analyze it.`;

        await this.messageHandler({
          channelType: 'telegram',
          channelId: String(ctx.chat.id),
          userId: String(ctx.from?.id ?? ''),
          messageId: String(ctx.message.message_id),
          text,
          attachments: [attachment],
        });
      } catch (err) {
        this.logger.error({ err }, 'Failed to process Telegram document');
        await ctx.reply('Failed to process the file. Please try again.');
      }
    });

    // Handle voice messages
    this.bot.on('message:voice', async (ctx) => {
      await ctx.reply(
        "I can't process voice messages yet — Claude Code only handles text and images.\n\n" +
          'Please type your message or send a screenshot instead.',
      );
    });

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      if (!this.messageHandler) return;
      await this.messageHandler({
        channelType: 'telegram',
        channelId: String(ctx.chat.id),
        userId: String(ctx.from?.id ?? ''),
        messageId: String(ctx.message.message_id),
        text: ctx.message.text,
      });
    });

    // Error handler
    this.bot.catch((err) => {
      this.logger.error(
        { err: err.error, ctx: err.ctx?.update?.update_id },
        'Telegram bot error',
      );
    });

    this.bot.start({
      onStart: () => {
        this.logger.info('Telegram bot connected');
      },
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onCallback(
    handler: (
      channelId: string,
      userId: string,
      callbackData: string,
      messageId: string,
    ) => Promise<void>,
  ): void {
    this.callbackHandler = handler;
  }

  async sendMessage(
    channelId: string,
    msg: OutboundMessage,
  ): Promise<string> {
    const chatId = Number(channelId);
    const maxLen = this.config.telegram.maxMessageLength;
    const chunks = splitLongMessage(msg.text, maxLen);

    const keyboard = msg.inlineKeyboard
      ? {
          reply_markup: {
            inline_keyboard: msg.inlineKeyboard.map((row) =>
              row.map((btn) => ({
                text: btn.text,
                callback_data: btn.callbackData,
              })),
            ),
          },
        }
      : {};

    const sent = await this.bot.api.sendMessage(chatId, chunks[0], keyboard);

    // Send remaining chunks without keyboard
    for (let i = 1; i < chunks.length; i++) {
      await this.bot.api.sendMessage(chatId, chunks[i]);
    }

    return String(sent.message_id);
  }

  async editMessage(
    channelId: string,
    messageId: string,
    msg: OutboundMessage,
  ): Promise<void> {
    const chatId = Number(channelId);
    const msgId = Number(messageId);
    try {
      await this.bot.api.editMessageText(chatId, msgId, msg.text);
    } catch {
      // Edit may fail if message hasn't changed — ignore
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
    try {
      await this.bot.api.sendChatAction(Number(channelId), 'typing');
    } catch {
      // Ignore typing indicator errors
    }
  }

  /** Expose raw bot for Heartbeat and other direct API access */
  get rawBot(): Bot {
    return this.bot;
  }

  private async downloadTelegramFile(
    fileId: string,
    type: 'image' | 'archive' | 'document',
    originalName?: string,
  ): Promise<Attachment> {
    const file = await this.bot.api.getFile(fileId);
    if (!file.file_path) {
      throw new Error('Could not get file path from Telegram');
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const dir = join(this.config.paths.dataDir, 'uploads');
    await mkdir(dir, { recursive: true });

    const ext = file.file_path.split('.').pop() ?? 'bin';
    const fileName = originalName ?? `upload_${Date.now()}.${ext}`;
    const localPath = join(dir, fileName).replace(/\\/g, '/');

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, buffer);

    this.logger.info(
      { localPath, bytes: buffer.length, type },
      'File downloaded from Telegram',
    );

    return {
      type,
      filename: fileName,
      localPath,
      mimeType: file.file_path.endsWith('.jpg')
        ? 'image/jpeg'
        : file.file_path.endsWith('.png')
          ? 'image/png'
          : 'application/octet-stream',
      sizeBytes: buffer.length,
    };
  }
}
