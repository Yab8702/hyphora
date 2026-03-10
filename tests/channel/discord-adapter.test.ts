import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock discord.js
vi.mock('discord.js', () => {
  const mockChannel = {
    isTextBased: vi.fn().mockReturnValue(true),
    send: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    sendTyping: vi.fn().mockResolvedValue(undefined),
    messages: {
      fetch: vi.fn().mockResolvedValue({
        edit: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };

  class MockClient {
    user = { id: 'bot123' };
    channels = {
      fetch: vi.fn().mockResolvedValue(mockChannel),
    };
    on = vi.fn();
    login = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  }

  class MockEmbedBuilder {
    data: any = {};
    setDescription(d: string) {
      this.data.description = d;
      return this;
    }
    setColor(c: number) {
      this.data.color = c;
      return this;
    }
    setFooter(f: { text: string }) {
      this.data.footer = f;
      return this;
    }
  }

  return {
    Client: MockClient,
    EmbedBuilder: MockEmbedBuilder,
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 3,
    },
  };
});

import { DiscordAdapter } from '../../src/channel/discord-adapter.js';

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('DiscordAdapter', () => {
  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
  });

  it('creates adapter with correct type', () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    expect(adapter.type).toBe('discord');
  });

  it('throws without DISCORD_BOT_TOKEN', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    await expect(adapter.start()).rejects.toThrow('DISCORD_BOT_TOKEN');
  });

  it('starts and stops without error', async () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    await adapter.start();
    await adapter.stop();
  });

  it('sends short message as plain text', async () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    await adapter.start();

    const msgId = await adapter.sendMessage('chan-1', { text: 'Hello!' });
    expect(msgId).toBe('msg-1');

    await adapter.stop();
  });

  it('registers message handler', () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    const handler = vi.fn();
    adapter.onMessage(handler);
  });

  it('registers callback handler', () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    const handler = vi.fn();
    adapter.onCallback(handler);
  });

  it('sends typing indicator', async () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    await adapter.start();
    // Should not throw
    await adapter.sendTypingIndicator('chan-1');
    await adapter.stop();
  });

  it('handles sendProgress with replaceMessageId', async () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    await adapter.start();
    const result = await adapter.sendProgress('chan-1', {
      type: 'status',
      text: 'Working...',
      replaceMessageId: 'msg-1',
    });
    expect(result).toBe('msg-1');
    await adapter.stop();
  });

  it('handles sendProgress without replaceMessageId', async () => {
    const adapter = new DiscordAdapter(
      { allowedChannelIds: [] },
      makeLogger(),
    );
    await adapter.start();
    const result = await adapter.sendProgress('chan-1', {
      type: 'status',
      text: 'Working...',
    });
    expect(result).toBe('msg-1');
    await adapter.stop();
  });
});
