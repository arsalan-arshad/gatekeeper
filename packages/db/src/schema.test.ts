import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTableName } from 'drizzle-orm';

import { DEFAULT_EMBEDDING_DIMENSIONS, PGVECTOR_EXTENSION_SQL } from './pgvector.ts';
import { abuseEvents, apiKeys, gateRules, requests, users } from './schema.ts';

test('core tables are defined', () => {
  assert.equal(getTableName(users), 'users');
  assert.equal(getTableName(gateRules), 'gate_rules');
  assert.equal(getTableName(requests), 'requests');
  assert.equal(getTableName(apiKeys), 'api_keys');
  assert.equal(getTableName(abuseEvents), 'abuse_events');
});

test('pgvector scaffolding exports extension SQL and dimensions', () => {
  assert.match(PGVECTOR_EXTENSION_SQL, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.equal(DEFAULT_EMBEDDING_DIMENSIONS, 768);
});
