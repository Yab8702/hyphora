import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock grammy
vi.mock('grammy', () => {
  class MockBot {
    use = vi.fn();
    on = vi.fn();
    catch = vi.fn();
    start = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    api = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      getFile: vi.fn().mockResolvedValue({ file_path: 'photos/test.jpg' }),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
  }
  return { Bot: MockBot };
});

import { TelegramAdapter } from '../../src/channel/telegram-adapter.js';

function makeConfig() {
  return {
    telegram: {
      allowedChatIds: [123],
      maxMessageLength: 4000,
    },
    paths: { dataDir: './data' },
    identity: { name: 'Test' },
  } as any;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('TelegramAdapter', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  });

  it('creates adapter with correct type', () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    expect(adapter.type).toBe('telegram');
  });

  it('throws if TELEGRAM_BOT_TOKEN not set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => new TelegramAdapter(makeConfig(), makeLogger())).toThrow(
      'TELEGRAM_BOT_TOKEN',
    );
  });

  it('sends message via bot API', async () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    const msgId = await adapter.sendMessage('123', { text: 'hello' });
    expect(msgId).toBe('42');
  });

  it('edits message via bot API', async () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    await adapter.editMessage('123', '42', { text: 'updated' });
    // Should not throw
  });

  it('sends typing indicator', async () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    await adapter.sendTypingIndicator('123');
    // Should not throw
  });

  it('sends progress by editing existing message', async () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    const msgId = await adapter.sendProgress('123', {
      type: 'status',
      text: 'Working...',
      replaceMessageId: '42',
    });
    expect(msgId).toBe('42');
  });

  it('sends progress as new message when no replaceMessageId', async () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    const msgId = await adapter.sendProgress('123', {
      type: 'status',
      text: 'Working...',
    });
    expect(msgId).toBe('42');
  });

  it('exposes raw bot', () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    expect(adapter.rawBot).toBeDefined();
  });

  it('registers message handler', () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    const handler = vi.fn();
    adapter.onMessage(handler);
    // Handler registered, will be called when bot receives messages
  });

  it('registers callback handler', () => {
    const adapter = new TelegramAdapter(makeConfig(), makeLogger());
    const handler = vi.fn();
    adapter.onCallback(handler);
    // Handler registered
  });
});
