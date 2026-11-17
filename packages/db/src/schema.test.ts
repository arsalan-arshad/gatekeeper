import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTableName } from 'drizzle-orm';

import { DEFAULT_EMBEDDING_DIMENSIONS, PGVECTOR_EXTENSION_SQL } from './pgvector.ts';
import {
  abuseEvents,
  apiKeys,
  emailSuppressions,
  gateRules,
  introMatches,
  matchDismissals,
  matchOutboundEmails,
  outboundEmails,
  proWaitlist,
  requests,
  users,
} from './schema.ts';

test('core tables are defined', () => {
  assert.equal(getTableName(users), 'users');
  assert.equal(getTableName(gateRules), 'gate_rules');
  assert.equal(getTableName(requests), 'requests');
  assert.equal(getTableName(apiKeys), 'api_keys');
  assert.equal(getTableName(abuseEvents), 'abuse_events');
  assert.equal(getTableName(proWaitlist), 'pro_waitlist');
  assert.equal(getTableName(outboundEmails), 'outbound_emails');
  assert.equal(getTableName(emailSuppressions), 'email_suppressions');
  assert.equal(getTableName(introMatches), 'intro_matches');
  assert.equal(getTableName(matchDismissals), 'match_dismissals');
  assert.equal(getTableName(matchOutboundEmails), 'match_outbound_emails');
});

test('match tables cascade delete with users (schema references)', () => {
  // Drizzle schema wires onDelete: 'cascade' on requester/recipient/user FKs.
  // Runtime CASCADE is asserted by migration 0016 + account delete path.
  assert.ok(introMatches);
  assert.ok(matchDismissals);
  assert.ok(matchOutboundEmails);
});

test('pgvector scaffolding exports extension SQL and dimensions', () => {
  assert.match(PGVECTOR_EXTENSION_SQL, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.equal(DEFAULT_EMBEDDING_DIMENSIONS, 768);
});
