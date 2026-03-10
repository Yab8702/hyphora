import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Logger } from '../utils/logger.js';

export interface WebhookServerOptions {
  port: number;
  host?: string;
  logger: Logger;
}

/**
 * HTTP server for webhook endpoints.
 * Provides /health and extensible route registration.
 */
export class WebhookServer {
  private app: FastifyInstance;
  private readonly port: number;
  private readonly host: string;
  private readonly logger: Logger;

  constructor(options: WebhookServerOptions) {
    this.port = options.port;
    this.host = options.host ?? '0.0.0.0';
    this.logger = options.logger;

    this.app = Fastify({ logger: false });

    // Health endpoint
    this.app.get('/health', async () => {
      return { status: 'ok', uptime: process.uptime() };
    });
  }

  /**
   * Get the Fastify instance for registering additional routes.
   */
  get fastify(): FastifyInstance {
    return this.app;
  }

  async start(): Promise<void> {
    await this.app.listen({ port: this.port, host: this.host });
    this.logger.info({ port: this.port }, 'Webhook server started');
  }

  async stop(): Promise<void> {
    await this.app.close();
    this.logger.info('Webhook server stopped');
  }
}
