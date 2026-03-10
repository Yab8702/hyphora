import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGenericWebhook } from '../../src/webhooks/generic.js';

const TOKEN = 'test-bearer-token';

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('Generic webhook', () => {
  let app: ReturnType<typeof Fastify>;
  let handler: { onWebhook: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    app = Fastify({ logger: false });
    handler = { onWebhook: vi.fn().mockResolvedValue(undefined) };
    registerGenericWebhook(
      app,
      { bearerToken: TOKEN },
      handler,
      makeLogger(),
    );
    await app.ready();
  });

  it('accepts valid bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/generic',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      payload: JSON.stringify({ prompt: 'do something' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.received).toBe(true);
  });

  it('rejects invalid bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/generic',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token',
      },
      payload: JSON.stringify({ prompt: 'do something' }),
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects missing authorization', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/generic',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ prompt: 'do something' }),
    });

    expect(res.statusCode).toBe(401);
  });

  it('calls handler with payload', async () => {
    const payload = { prompt: 'run tests', cwd: '/projects/myapp' };

    await app.inject({
      method: 'POST',
      url: '/webhooks/generic',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      payload: JSON.stringify(payload),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(handler.onWebhook).toHaveBeenCalledOnce();
    const received = handler.onWebhook.mock.calls[0][0];
    expect(received.prompt).toBe('run tests');
  });
});
