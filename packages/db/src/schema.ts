import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
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
  /**
   * Opt-in public directory listing. Default false — never auto-opt anyone in.
   * Existing users stay opted out until they explicitly enable it.
   */
  directoryOptIn: boolean('directory_opt_in').notNull().default(false),
  directoryOptInAt: timestamp('directory_opt_in_at', { withTimezone: true }),
  /** Short public role label for /explore (e.g. "Mobile engineer"). */
  directoryRole: text('directory_role'),
  /** Skill/topic tags (lowercase slugs); max 10 enforced in API. */
  directoryTags: text('directory_tags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** When set, hide the dashboard "list yourself" banner. */
  directoryPromptDismissedAt: timestamp('directory_prompt_dismissed_at', {
    withTimezone: true,
  }),
  /**
   * Match embeddings (want↔offer). Never include never_text or private rules.
   * HNSW indexes can be added later when user volume warrants it.
   */
  wantsEmbedding: vector('wants_embedding', {
    dimensions: PROFILE_EMBEDDING_DIMENSIONS,
  }),
  offersEmbedding: vector('offers_embedding', {
    dimensions: PROFILE_EMBEDDING_DIMENSIONS,
  }),
  matchEmbeddingsAt: timestamp('match_embeddings_at', { withTimezone: true }),
  /**
   * Optional contact email for intros. When null or unverified, login email is used.
   * Never returned by public/directory/match endpoints.
   * Ownership is proven via intro_contact_verified_at (user-scoped magic link) —
   * never via the global verified_senders table.
   */
  introContactEmail: text('intro_contact_email'),
  /** Set only after the user completes a verify link sent to intro_contact_email. */
  introContactVerifiedAt: timestamp('intro_contact_verified_at', { withTimezone: true }),
  /** Profile last update — used for sitemap lastmod on `/@handle`. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const matchStatusEnum = pgEnum('match_status', [
  'pending',
  'accepted',
  'declined',
  'expired',
  'gated',
]);

/**
 * Double opt-in intro matches between directory members.
 * ON DELETE CASCADE cleans rows when either user is deleted.
 */
export const introMatches = pgTable('intro_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  requesterId: uuid('requester_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  similarity: doublePrecision('similarity').notNull(),
  aiScore: integer('ai_score'),
  aiDecision: decisionEnum('ai_decision'),
  aiReasonPublic: text('ai_reason_public'),
  status: matchStatusEnum('status').notNull().default('pending'),
  recipientDecision: decisionEnum('recipient_decision'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const matchDismissals = pgTable(
  'match_dismissals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dismissedUserId: uuid('dismissed_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dismissedUserId] })],
);

/** Idempotent outbound email ledger for matches (separate from request-scoped outbound_emails). */
export const matchOutboundEmails = pgTable(
  'match_outbound_emails',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => introMatches.id, { onDelete: 'cascade' }),
    emailType: text('email_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.emailType] })],
);

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

/** Pro plan waitlist when Lemon Squeezy checkout is not configured. */
export const proWaitlist = pgTable('pro_waitlist', {
  email: text('email').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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

/**
 * Senders who completed one-click email verification (24h token).
 * Unverified senderContact must never receive reject/intro/decline mail.
 */
export const verifiedSenders = pgTable('verified_senders', {
  email: text('email').primaryKey(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Durable fixed-window rate limit counters (Postgres; shared across instances). */
export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  bucketKey: text('bucket_key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  /** AI verdict — never overwritten by owner approve/decline/override. */
  decision: decisionEnum('decision'),
  /**
   * Owner's explicit decision when it differs from (or confirms) the AI verdict.
   * Null until the owner acts. Does not replace `decision` / AI score / reason.
   */
  ownerDecision: decisionEnum('owner_decision'),
  /** When the owner last set owner_decision (approve / decline / override / spam). */
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  status: requestStatusEnum('status').notNull().default('pending'),
  stakeCents: integer('stake_cents').notNull().default(0),
  /** Receiver 1-click helpful rating from the intro email; null = not rated. */
  helpful: boolean('helpful'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Idempotent outbound email ledger — unique per (request, type).
 * Claim a slot with INSERT … ON CONFLICT DO NOTHING RETURNING before send.
 */
export const outboundEmails = pgTable(
  'outbound_emails',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    emailType: text('email_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.emailType] })],
);

/**
 * Addresses that must not receive mail (Resend bounce / complaint webhooks).
 */
export const emailSuppressions = pgTable('email_suppressions', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  source: text('source').notNull().default('resend'),
  payload: text('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Monthly public-ledger aggregates per target user.
 * - accepted = owner-approved (owner_decision=accept) or AI-forwarded (status=delivered/accepted)
 *   — may still await double opt-in completion
 * - delivered = both sides confirmed (status=accepted)
 * - accept_rate = accepted / requests (0 when no requests)
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
      count(*) FILTER (WHERE status = 'accepted')::int AS delivered_count,
      count(*) FILTER (
        WHERE owner_decision = 'accept'
          OR status IN ('delivered', 'accepted')
      )::int AS accepted_count,
      count(*) FILTER (WHERE decision = 'spam')::int AS spam_count,
      count(*) FILTER (WHERE helpful IS TRUE)::int AS helpful_count,
      CASE
        WHEN count(*) = 0 THEN 0::float8
        ELSE (
          count(*) FILTER (
            WHERE owner_decision = 'accept'
              OR status IN ('delivered', 'accepted')
          )
        )::float8 / count(*)::float8
      END AS accept_rate
    FROM requests
    GROUP BY target_user_id, date_trunc('month', created_at)
  `,
);
