import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock twitter-api-v2
vi.mock('twitter-api-v2', () => {
  const mockV2 = {
    me: vi.fn().mockResolvedValue({ data: { id: 'bot123', username: 'testbot' } }),
    reply: vi.fn().mockResolvedValue({ data: { id: 'tweet-1' } }),
    userMentionTimeline: vi.fn().mockResolvedValue({ data: { data: null } }),
  };

  class MockTwitterApi {
    v2 = mockV2;
    constructor(_opts: any) {}
  }

  return { TwitterApi: MockTwitterApi };
});

import { TwitterAdapter } from '../../src/channel/twitter-adapter.js';

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('TwitterAdapter', () => {
  beforeEach(() => {
    process.env.TWITTER_API_KEY = 'key';
    process.env.TWITTER_API_SECRET = 'secret';
    process.env.TWITTER_ACCESS_TOKEN = 'token';
    process.env.TWITTER_ACCESS_SECRET = 'secret';
    process.env.TWITTER_BEARER_TOKEN = 'bearer';
  });

  it('creates adapter with correct type', () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 60 },
      makeLogger(),
    );
    expect(adapter.type).toBe('twitter');
  });

  it('throws without API keys', async () => {
    delete process.env.TWITTER_API_KEY;
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 60 },
      makeLogger(),
    );
    await expect(adapter.start()).rejects.toThrow('TWITTER_API_KEY');
  });

  it('starts and stops without error', async () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    await adapter.start();
    await adapter.stop();
  });

  it('sends short message as single reply', async () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    await adapter.start();

    const msgId = await adapter.sendMessage('tweet-orig', { text: 'Hello!' });
    expect(msgId).toBe('tweet-1');

    await adapter.stop();
  });

  it('registers message handler', () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    const handler = vi.fn();
    adapter.onMessage(handler);
    // No error
  });

  it('registers callback handler', () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    const handler = vi.fn();
    adapter.onCallback(handler);
    // No error
  });

  it('editMessage is no-op (Twitter limitation)', async () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    // Should not throw
    await adapter.editMessage('123', '456', { text: 'update' });
  });

  it('sendProgress returns empty string (no edit on Twitter)', async () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    const result = await adapter.sendProgress('123', {
      type: 'status',
      text: 'Working...',
    });
    expect(result).toBe('');
  });

  it('sendTypingIndicator is no-op', async () => {
    const adapter = new TwitterAdapter(
      { allowedUsernames: [], pollIntervalSeconds: 999 },
      makeLogger(),
    );
    // Should not throw
    await adapter.sendTypingIndicator('123');
  });
});
