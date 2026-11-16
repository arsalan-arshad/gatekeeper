import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emptyGlobalLedger, formatPercent, LEDGER_STAT_HELP } from './ledger.ts';

test('emptyGlobalLedger is a public zeroed payload', () => {
  const payload = emptyGlobalLedger();
  assert.equal(payload.scope, 'global');
  assert.equal(payload.totals.requestCount, 0);
  assert.equal(payload.totals.trustScore, null);
  assert.deepEqual(payload.months, []);
});

test('formatPercent handles null', () => {
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(0.5), '50%');
});

test('ledger Accepted/Delivered copy explains owner-approved vs both sides', () => {
  assert.match(LEDGER_STAT_HELP.accepted, /Owner-approved/i);
  assert.match(LEDGER_STAT_HELP.accepted, /double opt-in/i);
  assert.equal(LEDGER_STAT_HELP.delivered, 'Delivered = both sides confirmed');
  assert.match(LEDGER_STAT_HELP.blurb, /both sides confirmed/i);
});

test('landing hero aligns text to top at md+ (not vertically centered)', async () => {
  const page = await readFile(fileURLToPath(new URL('../app/page.tsx', import.meta.url)), 'utf8');
  assert.match(page, /md:items-start/);
  assert.doesNotMatch(page, /md:items-center/);
});

test('public intro form keeps email as a controlled value', async () => {
  const src = await readFile(
    fileURLToPath(new URL('../app/u/[handle]/intro-form.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(src, /const \[email, setEmail\] = useState\(''\)/);
  assert.match(src, /value=\{email\}/);
  assert.match(src, /setEmail\(payload\.senderContact\)/);
});
