import { describe, it, expect, afterEach, vi } from 'vitest';
import { WebhookServer } from '../../src/webhooks/server.js';

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('WebhookServer', () => {
  let server: WebhookServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('starts and stops without error', async () => {
    server = new WebhookServer({ port: 0, logger: makeLogger() });
    await server.start();
    await server.stop();
    server = null;
  });

  it('responds to /health endpoint', async () => {
    server = new WebhookServer({ port: 0, logger: makeLogger() });
    await server.start();

    const response = await server.fastify.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThan(0);
  });

  it('returns 404 for unknown routes', async () => {
    server = new WebhookServer({ port: 0, logger: makeLogger() });
    await server.start();

    const response = await server.fastify.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });

  it('exposes fastify instance for route registration', () => {
    server = new WebhookServer({ port: 0, logger: makeLogger() });
    expect(server.fastify).toBeDefined();
  });
});
