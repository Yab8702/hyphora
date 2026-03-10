import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';

export interface GenericWebhookConfig {
  bearerToken: string;
}

export interface GenericWebhookHandler {
  onWebhook: (payload: Record<string, unknown>) => Promise<void>;
}

/**
 * Registers a generic webhook endpoint with bearer token authentication.
 * Accepts JSON payloads with a `prompt` field.
 */
export function registerGenericWebhook(
  fastify: FastifyInstance,
  config: GenericWebhookConfig,
  handler: GenericWebhookHandler,
  logger: Logger,
): void {
  fastify.post('/webhooks/generic', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify bearer token
    const auth = request.headers.authorization;
    if (!auth || auth !== `Bearer ${config.bearerToken}`) {
      logger.warn('Generic webhook: invalid or missing authorization');
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const payload = request.body as Record<string, unknown>;
    if (!payload || typeof payload !== 'object') {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    logger.info('Generic webhook received');

    handler.onWebhook(payload).catch((err) => {
      logger.error({ err }, 'Generic webhook handler failed');
    });

    return reply.status(200).send({ received: true });
  });
}
