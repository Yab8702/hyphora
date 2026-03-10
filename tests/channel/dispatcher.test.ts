import { describe, it, expect, vi } from 'vitest';
import { ChannelDispatcher } from '../../src/channel/dispatcher.js';
import type { ChannelAdapter, InboundMessage } from '../../src/channel/types.js';

function makeChannel(): ChannelAdapter & {
  triggerMessage: (msg: InboundMessage) => Promise<void>;
} {
  let messageHandler: ((msg: InboundMessage) => Promise<void>) | undefined;
  let callbackHandler:
    | ((
        channelId: string,
        userId: string,
        data: string,
        msgId: string,
      ) => Promise<void>)
    | undefined;

  return {
    type: 'telegram',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn((handler) => {
      messageHandler = handler;
    }),
    onCallback: vi.fn((handler) => {
      callbackHandler = handler;
    }),
    sendMessage: vi.fn().mockResolvedValue('100'),
    editMessage: vi.fn().mockResolvedValue(undefined),
    sendProgress: vi.fn().mockResolvedValue('100'),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    triggerMessage: async (msg: InboundMessage) => {
      if (messageHandler) await messageHandler(msg);
    },
  };
}

function makeConfig() {
  return {
    identity: { name: 'TestBot' },
    telegram: { maxMessageLength: 4000 },
    memory: { files: ['general.md'], maxContextChars: 8000 },
    agent: {
      cwd: '/tmp',
      model: 'sonnet',
      maxBudgetUsd: 1,
      maxTurns: 20,
      allowedTools: ['Read'],
      permissionMode: 'acceptEdits',
    },
  } as any;
}

function makeDeps() {
  const queue = {
    enqueue: vi.fn(),
    getInfo: vi.fn().mockReturnValue({ status: 'idle', queueLength: 0, elapsedMs: 0 }),
    cancelCurrent: vi.fn().mockReturnValue(false),
  } as any;
  const memory = {
    getAllMemory: vi.fn().mockReturnValue(null),
    append: vi.fn().mockResolvedValue(undefined),
  } as any;
  const history = {
    getRecent: vi.fn().mockResolvedValue([]),
    getTotalCost: vi.fn().mockResolvedValue(0),
    getCount: vi.fn().mockResolvedValue(0),
  } as any;
  const sessions = {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
  } as any;
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;

  return { queue, memory, history, sessions, logger };
}

describe('ChannelDispatcher', () => {
  it('adds channel and registers handlers', () => {
    const deps = makeDeps();
    const dispatcher = new ChannelDispatcher(
      makeConfig(),
      deps.queue,
      deps.memory,
      deps.history,
      deps.sessions,
      deps.logger,
    );
    const channel = makeChannel();
    dispatcher.addChannel(channel);

    expect(channel.onMessage).toHaveBeenCalledOnce();
    expect(channel.onCallback).toHaveBeenCalledOnce();
  });

  it('routes commands to command handler', async () => {
    const deps = makeDeps();
    const dispatcher = new ChannelDispatcher(
      makeConfig(),
      deps.queue,
      deps.memory,
      deps.history,
      deps.sessions,
      deps.logger,
    );
    const channel = makeChannel();
    dispatcher.addChannel(channel);

    await channel.triggerMessage({
      channelType: 'telegram',
      channelId: '123',
      userId: '456',
      text: '/help',
    });

    // /help sends a message
    expect(channel.sendMessage).toHaveBeenCalled();
    // Should NOT enqueue a task
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues task for regular messages', async () => {
    const deps = makeDeps();
    const dispatcher = new ChannelDispatcher(
      makeConfig(),
      deps.queue,
      deps.memory,
      deps.history,
      deps.sessions,
      deps.logger,
    );
    const channel = makeChannel();
    dispatcher.addChannel(channel);

    await channel.triggerMessage({
      channelType: 'telegram',
      channelId: '123',
      userId: '456',
      text: 'fix the bug',
    });

    // Should send acknowledgment then enqueue
    expect(channel.sendMessage).toHaveBeenCalled();
    expect(deps.queue.enqueue).toHaveBeenCalledOnce();

    const task = deps.queue.enqueue.mock.calls[0][0];
    expect(task.prompt).toBe('fix the bug');
    expect(task.channelType).toBe('telegram');
    expect(task.channelId).toBe('123');
  });

  it('strips /ask prefix from messages', async () => {
    const deps = makeDeps();
    const dispatcher = new ChannelDispatcher(
      makeConfig(),
      deps.queue,
      deps.memory,
      deps.history,
      deps.sessions,
      deps.logger,
    );
    const channel = makeChannel();
    dispatcher.addChannel(channel);

    await channel.triggerMessage({
      channelType: 'telegram',
      channelId: '123',
      userId: '456',
      text: '/ask do something',
    });

    const task = deps.queue.enqueue.mock.calls[0][0];
    expect(task.prompt).toBe('do something');
  });

  it('rejects empty prompts', async () => {
    const deps = makeDeps();
    const dispatcher = new ChannelDispatcher(
      makeConfig(),
      deps.queue,
      deps.memory,
      deps.history,
      deps.sessions,
      deps.logger,
    );
    const channel = makeChannel();
    dispatcher.addChannel(channel);

    await channel.triggerMessage({
      channelType: 'telegram',
      channelId: '123',
      userId: '456',
      text: '/ask',
    });

    expect(deps.queue.enqueue).not.toHaveBeenCalled();
    const text = channel.sendMessage.mock.calls[0][1].text;
    expect(text).toContain('Usage');
  });

  it('retrieves channel by type', () => {
    const deps = makeDeps();
    const dispatcher = new ChannelDispatcher(
      makeConfig(),
      deps.queue,
      deps.memory,
      deps.history,
      deps.sessions,
      deps.logger,
    );
    const channel = makeChannel();
    dispatcher.addChannel(channel);

    expect(dispatcher.getChannel('telegram')).toBe(channel);
    expect(dispatcher.getChannel('discord')).toBeUndefined();
  });
});
