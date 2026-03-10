import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCommand, isGodMode } from '../../src/channel/command-handler.js';
import type { InboundMessage } from '../../src/channel/types.js';

function makeChannel() {
  return {
    type: 'telegram',
    sendMessage: vi.fn().mockResolvedValue('1'),
    editMessage: vi.fn().mockResolvedValue(undefined),
    sendProgress: vi.fn().mockResolvedValue('1'),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
    stop: vi.fn(),
    onMessage: vi.fn(),
    onCallback: vi.fn(),
  } as any;
}

function makeCtx(channel = makeChannel()) {
  return {
    channel,
    config: {
      identity: { name: 'TestBot' },
      telegram: { maxMessageLength: 4000 },
      memory: { files: ['general.md'] },
    } as any,
    queue: {
      getInfo: vi.fn().mockReturnValue({ status: 'idle', queueLength: 0, elapsedMs: 0 }),
      cancelCurrent: vi.fn().mockReturnValue(false),
    } as any,
    memory: {
      getAllMemory: vi.fn().mockReturnValue(null),
      append: vi.fn().mockResolvedValue(undefined),
    } as any,
    history: {
      getRecent: vi.fn().mockResolvedValue([]),
      getTotalCost: vi.fn().mockResolvedValue(0),
      getCount: vi.fn().mockResolvedValue(0),
    } as any,
    sessions: {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
  };
}

function makeMsg(text: string): InboundMessage {
  return {
    channelType: 'telegram',
    channelId: '123',
    userId: '456',
    text,
  };
}

describe('handleCommand', () => {
  it('handles /help', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/help'), ctx);
    expect(result.handled).toBe(true);
    expect(ctx.channel.sendMessage).toHaveBeenCalledOnce();
    const text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('TestBot');
    expect(text).toContain('/ask');
  });

  it('handles /start', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/start'), ctx);
    expect(result.handled).toBe(true);
  });

  it('handles /status when idle', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/status'), ctx);
    expect(result.handled).toBe(true);
    const text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('idle');
  });

  it('handles /memory when empty', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/memory'), ctx);
    expect(result.handled).toBe(true);
    const text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('empty');
  });

  it('handles /memory add', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/memory add remember this'), ctx);
    expect(result.handled).toBe(true);
    expect(ctx.memory.append).toHaveBeenCalledWith('general.md', 'remember this');
  });

  it('handles /history when empty', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/history'), ctx);
    expect(result.handled).toBe(true);
    const text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('No history');
  });

  it('handles /cancel when nothing running', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/cancel'), ctx);
    expect(result.handled).toBe(true);
    const text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('No task');
  });

  it('handles /cost', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/cost'), ctx);
    expect(result.handled).toBe(true);
  });

  it('handles /god toggle on and off', async () => {
    const ctx = makeCtx();

    // Toggle ON
    await handleCommand(makeMsg('/god'), ctx);
    expect(isGodMode('telegram', '456')).toBe(true);
    let text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('ON');

    // Toggle OFF
    await handleCommand(makeMsg('/god'), ctx);
    expect(isGodMode('telegram', '456')).toBe(false);
    text = ctx.channel.sendMessage.mock.calls[1][1].text;
    expect(text).toContain('OFF');
  });

  it('handles /name without args', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/name'), ctx);
    expect(result.handled).toBe(true);
    const text = ctx.channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('TestBot');
  });

  it('does not handle plain text', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('hello world'), ctx);
    expect(result.handled).toBe(false);
  });

  it('does not handle /ask (it is a task prefix)', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/ask do something'), ctx);
    expect(result.handled).toBe(false);
  });

  it('does not handle unknown commands', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/unknown'), ctx);
    expect(result.handled).toBe(false);
  });

  it('strips bot mention from command', async () => {
    const ctx = makeCtx();
    const result = await handleCommand(makeMsg('/help@mybot'), ctx);
    expect(result.handled).toBe(true);
  });
});
