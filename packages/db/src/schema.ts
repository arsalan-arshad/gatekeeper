import { sql } from 'drizzle-orm';
import {
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

/** Keep in sync with DEFAULT_EMBEDDING_DIMENSIONS in pgvector.ts (Gemini text-embedding-004). */
const PROFILE_EMBEDDING_DIMENSIONS = 768;

export const senderTypeEnum = pgEnum('sender_type', ['human', 'agent']);

export const decisionEnum = pgEnum('decision', ['accept', 'reject', 'spam']);
export const requestStatusEnum = pgEnum('request_status', [
  'pending',
  'delivered',
  'accepted',
  'declined',
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
  aiReason: text('ai_reason'),
  decision: decisionEnum('decision'),
  status: requestStatusEnum('status').notNull().default('pending'),
  stakeCents: integer('stake_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Monthly public-ledger aggregates per target user.
 * accept_rate = accepts / total requests in that month (0 when empty).
 */
export const ledgerStats = pgView('ledger_stats', {
  targetUserId: uuid('target_user_id').notNull(),
  month: timestamp('month', { withTimezone: true }).notNull(),
  requestCount: integer('request_count').notNull(),
  acceptCount: integer('accept_count').notNull(),
  rejectCount: integer('reject_count').notNull(),
  spamCount: integer('spam_count').notNull(),
  acceptRate: doublePrecision('accept_rate').notNull(),
}).as(
  sql`
    SELECT
      target_user_id,
      date_trunc('month', created_at) AS month,
      count(*)::int AS request_count,
      count(*) FILTER (WHERE decision = 'accept')::int AS accept_count,
      count(*) FILTER (WHERE decision = 'reject')::int AS reject_count,
      count(*) FILTER (WHERE decision = 'spam')::int AS spam_count,
      CASE
        WHEN count(*) = 0 THEN 0::float8
        ELSE (count(*) FILTER (WHERE decision = 'accept'))::float8 / count(*)::float8
      END AS accept_rate
    FROM requests
    GROUP BY target_user_id, date_trunc('month', created_at)
  `,
);
