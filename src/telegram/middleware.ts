import type { MiddlewareFn, Context } from 'grammy';
import type { RegistrationManager } from '../auth/registration.js';

/**
 * Classic allowlist middleware — rejects anyone not in allowedChatIds.
 */
export function authMiddleware(
  allowedChatIds: number[],
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId || !allowedChatIds.includes(chatId)) {
      await ctx.reply(
        `Unauthorized. Your chat ID (${chatId ?? 'unknown'}) is not in the allowlist.`,
      );
      return;
    }
    await next();
  };
}

/**
 * Auto-registration middleware — anyone can /start to register.
 * First user to register becomes the owner.
 * Unregistered users get a prompt to /start first.
 */
export function autoRegistrationMiddleware(
  registration: RegistrationManager,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const userId = String(ctx.from?.id ?? '');
    const text = ctx.message?.text?.trim() ?? '';

    if (!chatId || !userId) {
      return;
    }

    // Always allow /start through so users can self-register
    const isStartCmd = text === '/start' || text.startsWith('/start ') || text.startsWith('/start@');
    if (isStartCmd) {
      await next();
      return;
    }

    // Check if already registered
    if (registration.isRegistered('telegram', userId)) {
      await next();
      return;
    }

    // Not registered — prompt to /start
    await ctx.reply(
      `You're not registered yet.\n\nSend /start to register and get access.`,
    );
  };
}
