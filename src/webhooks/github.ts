import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../utils/logger.js';

export interface GitHubWebhookConfig {
  secret: string;
  events: string[];
}

export interface GitHubWebhookHandler {
  onEvent: (event: GitHubEvent) => Promise<void>;
}

export interface GitHubEvent {
  event: string;
  action?: string;
  delivery: string;
  payload: Record<string, unknown>;
}

/**
 * Registers GitHub webhook route with HMAC-SHA256 signature verification.
 */
export function registerGitHubWebhook(
  fastify: FastifyInstance,
  config: GitHubWebhookConfig,
  handler: GitHubWebhookHandler,
  logger: Logger,
): void {
  // Need raw body for HMAC verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post('/webhooks/github', async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const event = request.headers['x-github-event'] as string | undefined;
    const delivery = request.headers['x-github-delivery'] as string | undefined;

    if (!signature || !event || !delivery) {
      logger.warn('GitHub webhook: missing required headers');
      return reply.status(400).send({ error: 'Missing required headers' });
    }

    // Verify HMAC-SHA256 signature
    const body = request.body as Buffer;
    const expectedSig =
      'sha256=' +
      crypto.createHmac('sha256', config.secret).update(body).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);

    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      logger.warn({ delivery }, 'GitHub webhook: invalid signature');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // Check if event is in allowed list
    if (!config.events.includes(event)) {
      logger.debug({ event, delivery }, 'GitHub webhook: event not in allowed list');
      return reply.status(200).send({ ignored: true, event });
    }

    // Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body.toString());
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON payload' });
    }

    const ghEvent: GitHubEvent = {
      event,
      action: payload.action as string | undefined,
      delivery,
      payload,
    };

    logger.info(
      { event, action: ghEvent.action, delivery },
      'GitHub webhook received',
    );

    // Handle asynchronously — don't block the response
    handler.onEvent(ghEvent).catch((err) => {
      logger.error({ err, delivery }, 'GitHub webhook handler failed');
    });

    return reply.status(200).send({ received: true, event, delivery });
  });
}

/**
 * Build a task prompt from a GitHub event.
 */
export function buildGitHubPrompt(event: GitHubEvent): string | null {
  const { event: eventType, action, payload } = event;

  if (eventType === 'pull_request' && action === 'opened') {
    const pr = payload.pull_request as Record<string, unknown>;
    const title = pr?.title ?? 'Unknown PR';
    const number = pr?.number ?? '?';
    const body = String(pr?.body ?? '').slice(0, 500);
    const htmlUrl = pr?.html_url ?? '';
    return `Review this pull request #${number}: "${title}"\n\nDescription: ${body}\n\nURL: ${htmlUrl}\n\nProvide a thorough code review with suggestions.`;
  }

  if (eventType === 'workflow_run' && action === 'completed') {
    const run = payload.workflow_run as Record<string, unknown>;
    const conclusion = run?.conclusion;
    if (conclusion === 'failure') {
      const name = run?.name ?? 'Unknown workflow';
      const htmlUrl = run?.html_url ?? '';
      return `CI workflow "${name}" failed. Investigate the failure and suggest fixes.\n\nURL: ${htmlUrl}`;
    }
    return null; // Don't act on successful runs
  }

  if (eventType === 'issues' && action === 'opened') {
    const issue = payload.issue as Record<string, unknown>;
    const title = issue?.title ?? 'Unknown issue';
    const number = issue?.number ?? '?';
    const body = String(issue?.body ?? '').slice(0, 500);
    return `Triage this new issue #${number}: "${title}"\n\nDescription: ${body}\n\nAnalyze the issue, categorize it, and suggest an approach.`;
  }

  return null;
}
