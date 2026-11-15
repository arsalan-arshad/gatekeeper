import { billingAccounts, paymentEvents, proWaitlist, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDb } from '../db.js';
import {
  createLemonCheckout,
  extractEmailFromLemonEvent,
  parseLemonWebhook,
  verifyLemonWebhookSignature,
} from '../lemon.js';
import { addCredits, paymentsConfigPublic, paymentsEnabled, setUserProPlan } from '../payments.js';

function requireUserEmail(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string' || !header.includes('@')) return null;
  return header.trim().toLowerCase();
}

const checkoutSchema = z.object({
  kind: z.enum(['pro', 'credits']),
  creditCents: z.number().int().positive().optional(),
});

const waitlistSchema = z.object({
  email: z.string().email(),
});

export async function registerPaymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/payments/config', async () => paymentsConfigPublic());

  app.get('/v1/payments/me', async (request, reply) => {
    const email = requireUserEmail(request.headers['x-user-email']);
    if (!email) {
      return reply.status(401).send({ error: 'Missing x-user-email' });
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const [account] = await db
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.email, email))
      .limit(1);

    return {
      enabled: paymentsEnabled(),
      config: paymentsConfigPublic(),
      user: user
        ? {
            email: user.email,
            plan: user.plan,
            lemonSubscriptionId: user.lemonSubscriptionId,
          }
        : { email, plan: 'free' as const, lemonSubscriptionId: null },
      creditsCents: account?.creditsCents ?? 0,
    };
  });

  app.post('/v1/payments/waitlist', async (request, reply) => {
    const sessionEmail = requireUserEmail(request.headers['x-user-email']);
    if (!sessionEmail) {
      return reply.status(401).send({ error: 'Missing x-user-email' });
    }

    const parsed = waitlistSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid email', details: parsed.error.flatten() });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const db = getDb();
    await db
      .insert(proWaitlist)
      .values({ email })
      .onConflictDoNothing({ target: proWaitlist.email });

    return { ok: true, email };
  });

  app.post('/v1/payments/checkout', async (request, reply) => {
    if (!paymentsEnabled()) {
      return reply.status(503).send({
        error: 'Payments are disabled',
        hint: 'Set PAYMENTS_ENABLED=true to enable Lemon Squeezy checkouts',
      });
    }

    const email = requireUserEmail(request.headers['x-user-email']);
    if (!email) {
      return reply.status(401).send({ error: 'Missing x-user-email' });
    }

    const parsed = checkoutSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    try {
      const checkout = await createLemonCheckout({
        kind: parsed.data.kind,
        email,
        creditCents: parsed.data.creditCents,
        redirectUrl: `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/dashboard/billing`,
      });
      return { checkout };
    } catch (error) {
      request.log.error({ err: error }, 'lemon checkout failed');
      return reply.status(502).send({
        error: error instanceof Error ? error.message : 'Checkout failed',
      });
    }
  });

  app.post('/v1/payments/webhooks/lemon', async (request, reply) => {
    if (!paymentsEnabled()) {
      // Acknowledge so Lemon does not retry forever while the flag is off.
      return reply
        .status(200)
        .send({ ok: true, ignored: true, reason: 'PAYMENTS_ENABLED is false' });
    }

    const rawBody =
      (request as { rawBody?: string }).rawBody ??
      (typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));

    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim();
    if (!secret) {
      return reply.status(500).send({ error: 'LEMON_SQUEEZY_WEBHOOK_SECRET is not configured' });
    }

    const signature = request.headers['x-signature'];
    const sig = typeof signature === 'string' ? signature : undefined;
    if (!verifyLemonWebhookSignature(rawBody, sig, secret)) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    let event;
    try {
      event = parseLemonWebhook(rawBody);
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON' });
    }

    const eventId = `${event.meta.event_name}:${event.data.id}`;
    const db = getDb();

    try {
      await db.insert(paymentEvents).values({
        lemonEventId: eventId,
        eventName: event.meta.event_name,
        payload: rawBody,
      });
    } catch {
      return { ok: true, duplicate: true };
    }

    const email = extractEmailFromLemonEvent(event);
    const attrs = event.data.attributes;
    const customerId =
      typeof attrs.customer_id === 'number' || typeof attrs.customer_id === 'string'
        ? String(attrs.customer_id)
        : null;

    switch (event.meta.event_name) {
      case 'subscription_created':
      case 'subscription_resumed':
      case 'subscription_updated': {
        if (email) {
          const status = String(attrs.status ?? '');
          const active = status === 'active' || status === 'on_trial';
          await setUserProPlan({
            email,
            lemonCustomerId: customerId,
            lemonSubscriptionId: event.data.id,
            active,
          });
        }
        break;
      }
      case 'subscription_cancelled':
      case 'subscription_expired':
      case 'subscription_paused': {
        if (email) {
          await setUserProPlan({
            email,
            lemonCustomerId: customerId,
            lemonSubscriptionId: event.data.id,
            active: false,
          });
        }
        break;
      }
      case 'order_created': {
        const kind = event.meta.custom_data?.gatekeeper_kind;
        if (kind === 'credits' && email) {
          const cents = Number(
            event.meta.custom_data?.credit_cents ?? process.env.CREDITS_PACK_CENTS ?? 2500,
          );
          if (Number.isFinite(cents) && cents > 0) {
            await addCredits(email, Math.round(cents));
          }
        }
        break;
      }
      default:
        break;
    }

    return { ok: true };
  });
}
