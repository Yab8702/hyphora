import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import {
  registerGitHubWebhook,
  buildGitHubPrompt,
} from '../../src/webhooks/github.js';
import type { GitHubEvent } from '../../src/webhooks/github.js';

const SECRET = 'test-secret-123';

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

function signPayload(payload: string): string {
  return (
    'sha256=' +
    crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  );
}

describe('GitHub webhook', () => {
  let app: ReturnType<typeof Fastify>;
  let handler: { onEvent: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    app = Fastify({ logger: false });
    handler = { onEvent: vi.fn().mockResolvedValue(undefined) };
    registerGitHubWebhook(
      app,
      { secret: SECRET, events: ['pull_request', 'issues'] },
      handler,
      makeLogger(),
    );
    await app.ready();
  });

  it('accepts valid signed webhook', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      pull_request: { title: 'Fix bug', number: 1 },
    });
    const sig = signPayload(payload);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.received).toBe(true);
  });

  it('rejects invalid signature', async () => {
    const payload = JSON.stringify({ action: 'opened' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-2',
      },
      payload,
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects missing headers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(res.statusCode).toBe(400);
  });

  it('ignores events not in allowed list', async () => {
    const payload = JSON.stringify({ action: 'pushed' });
    const sig = signPayload(payload);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'push',
        'x-github-delivery': 'delivery-3',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ignored).toBe(true);
    expect(handler.onEvent).not.toHaveBeenCalled();
  });

  it('calls handler for allowed events', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      issue: { title: 'Bug report', number: 42 },
    });
    const sig = signPayload(payload);

    await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'issues',
        'x-github-delivery': 'delivery-4',
      },
      payload,
    });

    // Handler is called asynchronously
    await new Promise((r) => setTimeout(r, 50));
    expect(handler.onEvent).toHaveBeenCalledOnce();
    const event = handler.onEvent.mock.calls[0][0] as GitHubEvent;
    expect(event.event).toBe('issues');
    expect(event.action).toBe('opened');
  });
});

describe('buildGitHubPrompt', () => {
  it('builds prompt for opened PR', () => {
    const event: GitHubEvent = {
      event: 'pull_request',
      action: 'opened',
      delivery: 'd1',
      payload: {
        pull_request: {
          title: 'Add feature',
          number: 42,
          body: 'This adds a new feature',
          html_url: 'https://github.com/org/repo/pull/42',
        },
      },
    };
    const prompt = buildGitHubPrompt(event);
    expect(prompt).toContain('#42');
    expect(prompt).toContain('Add feature');
    expect(prompt).toContain('code review');
  });

  it('builds prompt for failed workflow', () => {
    const event: GitHubEvent = {
      event: 'workflow_run',
      action: 'completed',
      delivery: 'd2',
      payload: {
        workflow_run: {
          name: 'CI',
          conclusion: 'failure',
          html_url: 'https://github.com/org/repo/actions/runs/1',
        },
      },
    };
    const prompt = buildGitHubPrompt(event);
    expect(prompt).toContain('CI');
    expect(prompt).toContain('failed');
  });

  it('returns null for successful workflow', () => {
    const event: GitHubEvent = {
      event: 'workflow_run',
      action: 'completed',
      delivery: 'd3',
      payload: {
        workflow_run: { conclusion: 'success' },
      },
    };
    expect(buildGitHubPrompt(event)).toBeNull();
  });

  it('builds prompt for opened issue', () => {
    const event: GitHubEvent = {
      event: 'issues',
      action: 'opened',
      delivery: 'd4',
      payload: {
        issue: {
          title: 'Something broken',
          number: 10,
          body: 'Steps to reproduce...',
        },
      },
    };
    const prompt = buildGitHubPrompt(event);
    expect(prompt).toContain('#10');
    expect(prompt).toContain('Something broken');
    expect(prompt).toContain('Triage');
  });

  it('returns null for unknown events', () => {
    const event: GitHubEvent = {
      event: 'star',
      action: 'created',
      delivery: 'd5',
      payload: {},
    };
    expect(buildGitHubPrompt(event)).toBeNull();
  });
});
