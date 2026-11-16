import type { FastifyInstance } from 'fastify';

import {
  extractSuppressionFromResendEvent,
  recordEmailSuppression,
  verifyResendWebhookSignature,
  type ResendWebhookEvent,
} from '../email-suppression.js';

function headerString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export async function registerResendWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/webhooks/resend', async (request, reply) => {
    const rawBody =
      (request as { rawBody?: string }).rawBody ??
      (typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));

    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) {
      request.log.warn(
        'RESEND_WEBHOOK_SECRET unset — ignoring Resend webhook (configure to verify Svix signatures)',
      );
      return reply.status(204).send();
    }

    const ok = verifyResendWebhookSignature(
      rawBody,
      {
        id: headerString(request.headers['svix-id']),
        timestamp: headerString(request.headers['svix-timestamp']),
        signature: headerString(request.headers['svix-signature']),
      },
      secret,
    );

    if (!ok) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    let event: ResendWebhookEvent;
    try {
      event = JSON.parse(rawBody) as ResendWebhookEvent;
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON' });
    }

    const suppression = extractSuppressionFromResendEvent(event);
    if (!suppression) {
      return { ok: true, ignored: true };
    }

    await recordEmailSuppression({
      email: suppression.email,
      reason: suppression.reason,
      source: 'resend',
      payload: rawBody,
    });

    return { ok: true, suppressed: true, reason: suppression.reason };
  });
}
