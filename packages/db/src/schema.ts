import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/** Keep in sync with DEFAULT_EMBEDDING_DIMENSIONS in pgvector.ts (Gemini gemini-embedding-001). */
const PROFILE_EMBEDDING_DIMENSIONS = 768;

export const senderTypeEnum = pgEnum('sender_type', ['human', 'agent']);

export const decisionEnum = pgEnum('decision', ['accept', 'reject', 'spam']);
export const requestStatusEnum = pgEnum('request_status', [
  'pending',
  'delivered',
  'accepted',
  'declined',
]);

export const planEnum = pgEnum('plan', ['free', 'pro']);

export const notificationEmailModeEnum = pgEnum('notification_email_mode', [
  'instant',
  'daily_digest',
  'off',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  bio: text('bio'),
  wantsText: text('wants_text'),
  offersText: text('offers_text'),
  neverText: text('never_text'),
  profileEmbedding: vector('profile_embedding', {
    dimensions: PROFILE_EMBEDDING_DIMENSIONS,
  }),
  /** Lemon Squeezy Pro subscription — only enforced when PAYMENTS_ENABLED. */
  plan: planEnum('plan').notNull().default('free'),
  lemonCustomerId: text('lemon_customer_id'),
  lemonSubscriptionId: text('lemon_subscription_id'),
  /** Owner inbox email cadence for new intro requests. */
  notificationEmailMode: notificationEmailModeEnum('notification_email_mode')
    .notNull()
    .default('instant'),
});

/**
 * Wallet for senders (and receivers earning spam-stake credits).
 * Keyed by email so agents/senders need not be Gatekeeper users.
 */
export const billingAccounts = pgTable('billing_accounts', {
  email: text('email').primaryKey(),
  creditsCents: integer('credits_cents').notNull().default(0),
  lemonCustomerId: text('lemon_customer_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Idempotent Lemon Squeezy webhook log. */
export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  lemonEventId: text('lemon_event_id').notNull().unique(),
  eventName: text('event_name').notNull(),
  payload: text('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});

/** One editable ruleset per user (user_id is the primary key). */
export const gateRules = pgTable('gate_rules', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  ruleText: text('rule_text').notNull(),
  minRelevance: integer('min_relevance').notNull().default(70),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerEmail: text('owner_email').notNull(),
  hashedKey: text('hashed_key').notNull().unique(),
  rateLimit: integer('rate_limit').notNull().default(60),
});

/**
 * Abuse / protection signals (rate limits, oversized payloads, spam judgments).
 * Used for ops visibility — never exposed on public profiles.
 */
export const abuseEvents = pgTable('abuse_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: text('kind').notNull(),
  ip: text('ip'),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const requests = pgTable('requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  senderType: senderTypeEnum('sender_type').notNull(),
  senderName: text('sender_name').notNull(),
  senderContact: text('sender_contact').notNull(),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  targetUserId: uuid('target_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  aiScore: integer('ai_score'),
  /** Private judge rationale — never shown on public surfaces. */
  aiReason: text('ai_reason'),
  /** Public judge reason safe for owner inbox + sender replies. */
  aiReasonPublic: text('ai_reason_public'),
  decision: decisionEnum('decision'),
  status: requestStatusEnum('status').notNull().default('pending'),
  stakeCents: integer('stake_cents').notNull().default(0),
  /** Receiver 1-click helpful rating from the intro email; null = not rated. */
  helpful: boolean('helpful'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Monthly public-ledger aggregates per target user.
 * - delivered = AI accepted (forwarded to receiver for opt-in)
 * - accepted = receiver opted in
 * - accept_rate = delivered / requests
 * - trust uses helpful among delivered (computed in API all-time too)
 */
export const ledgerStats = pgView('ledger_stats', {
  targetUserId: uuid('target_user_id').notNull(),
  month: timestamp('month', { withTimezone: true }).notNull(),
  requestCount: integer('request_count').notNull(),
  deliveredCount: integer('delivered_count').notNull(),
  acceptedCount: integer('accepted_count').notNull(),
  spamCount: integer('spam_count').notNull(),
  helpfulCount: integer('helpful_count').notNull(),
  acceptRate: doublePrecision('accept_rate').notNull(),
}).as(
  sql`
    SELECT
      target_user_id,
      date_trunc('month', created_at) AS month,
      count(*)::int AS request_count,
      count(*) FILTER (WHERE decision = 'accept')::int AS delivered_count,
      count(*) FILTER (WHERE status = 'accepted')::int AS accepted_count,
      count(*) FILTER (WHERE decision = 'spam')::int AS spam_count,
      count(*) FILTER (WHERE helpful IS TRUE)::int AS helpful_count,
      CASE
        WHEN count(*) = 0 THEN 0::float8
        ELSE (count(*) FILTER (WHERE decision = 'accept'))::float8 / count(*)::float8
      END AS accept_rate
    FROM requests
    GROUP BY target_user_id, date_trunc('month', created_at)
  `,
);
