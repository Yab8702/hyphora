// Type declarations for optional dependencies.
// These packages are only loaded at runtime when their respective adapters are enabled.

declare module 'twitter-api-v2' {
  export class TwitterApi {
    constructor(opts: {
      appKey: string;
      appSecret: string;
      accessToken: string;
      accessSecret: string;
    });
    v2: {
      me(): Promise<{ data: { id: string; username: string } }>;
      reply(text: string, tweetId: string): Promise<{ data: { id: string } }>;
      userMentionTimeline(
        userId: string,
        params?: Record<string, unknown>,
      ): Promise<{
        data: {
          data?: Array<{
            id: string;
            text: string;
            author_id: string;
            conversation_id?: string;
          }>;
          includes?: {
            users?: Array<{ id: string; username: string }>;
          };
        };
      }>;
    };
  }
}

declare module 'discord.js' {
  export class Client {
    constructor(opts: { intents: number[] });
    user: { id: string } | null;
    channels: {
      fetch(id: string): Promise<TextChannel | null>;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
    login(token: string): Promise<void>;
    destroy(): void;
  }

  export interface TextChannel {
    isTextBased(): boolean;
    send(content: string | { embeds: EmbedBuilder[] }): Promise<{ id: string }>;
    sendTyping(): Promise<void>;
    messages: {
      fetch(id: string): Promise<{
        edit(content: string | { content: string; embeds: EmbedBuilder[] }): Promise<void>;
      }>;
    };
  }

  export class EmbedBuilder {
    setDescription(description: string): this;
    setColor(color: number): this;
    setFooter(footer: { text: string }): this;
  }

  export const GatewayIntentBits: {
    Guilds: number;
    GuildMessages: number;
    MessageContent: number;
  };
}
