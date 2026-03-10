import { describe, it, expect, vi } from 'vitest';
import { authMiddleware, autoRegistrationMiddleware } from '../../src/telegram/middleware.js';
import type { RegistrationManager } from '../../src/auth/registration.js';

function makeCtx(chatId?: number, userId?: string, text?: string) {
  return {
    chat: chatId !== undefined ? { id: chatId } : undefined,
    from: userId !== undefined ? { id: userId } : undefined,
    message: text !== undefined ? { text } : undefined,
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeRegistration(registered: boolean, isOwner = false): RegistrationManager {
  return {
    isRegistered: vi.fn().mockReturnValue(registered),
    isOwner: vi.fn().mockReturnValue(isOwner),
    register: vi.fn().mockResolvedValue({ registered: true, isOwner: false, alreadyRegistered: false }),
    getUsers: vi.fn().mockReturnValue([]),
    userCount: 0,
    load: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('authMiddleware', () => {
  it('calls next() for allowed chat IDs', async () => {
    const mw = authMiddleware([111, 222, 333]);
    const ctx = makeCtx(222);
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('blocks unauthorized chat IDs with reply', async () => {
    const mw = authMiddleware([111]);
    const ctx = makeCtx(999);
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply.mock.calls[0][0]).toContain('Unauthorized');
    expect(ctx.reply.mock.calls[0][0]).toContain('999');
  });

  it('blocks when chat is undefined', async () => {
    const mw = authMiddleware([111]);
    const ctx = makeCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply.mock.calls[0][0]).toContain('unknown');
  });

  it('blocks when allowedChatIds is empty', async () => {
    const mw = authMiddleware([]);
    const ctx = makeCtx(111);
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('allows first chat ID in list', async () => {
    const mw = authMiddleware([100, 200]);
    const ctx = makeCtx(100);
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('allows last chat ID in list', async () => {
    const mw = authMiddleware([100, 200]);
    const ctx = makeCtx(200);
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('autoRegistrationMiddleware', () => {
  it('allows /start through for unregistered users', async () => {
    const reg = makeRegistration(false);
    const mw = autoRegistrationMiddleware(reg);
    const ctx = makeCtx(111, '111', '/start');
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('allows registered users through', async () => {
    const reg = makeRegistration(true);
    const mw = autoRegistrationMiddleware(reg);
    const ctx = makeCtx(111, '111', 'hello');
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks unregistered users on non-/start messages', async () => {
    const reg = makeRegistration(false);
    const mw = autoRegistrationMiddleware(reg);
    const ctx = makeCtx(999, '999', 'hello there');
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply.mock.calls[0][0]).toContain('/start');
  });

  it('allows /start with bot mention through', async () => {
    const reg = makeRegistration(false);
    const mw = autoRegistrationMiddleware(reg);
    const ctx = makeCtx(111, '111', '/start@mybot');
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
