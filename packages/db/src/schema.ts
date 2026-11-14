import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Minimal placeholder schema for Step 1.
 * Full tables (users, gate_rules, requests, api_keys, embeddings) land in Step 3.
 */
export const healthChecks = pgTable('health_checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull().default('ok'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
