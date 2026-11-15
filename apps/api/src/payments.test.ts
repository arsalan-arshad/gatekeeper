import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { verifyLemonWebhookSignature } from './lemon.ts';
import {
  paymentsConfigPublic,
  paymentsEnabled,
  PRO_PRICE_USD,
  stakeCentsFromEnv,
} from './payments.ts';

test('paymentsEnabled is off unless explicitly true', () => {
  assert.equal(paymentsEnabled({}), false);
  assert.equal(paymentsEnabled({ PAYMENTS_ENABLED: 'false' }), false);
  assert.equal(paymentsEnabled({ PAYMENTS_ENABLED: 'true' }), true);
  assert.equal(paymentsEnabled({ PAYMENTS_ENABLED: '1' }), true);
});

test('paymentsConfigPublic exposes Pro price and stake defaults', () => {
  const config = paymentsConfigPublic({
    PAYMENTS_ENABLED: 'true',
    LEMON_SQUEEZY_API_KEY: 'x',
    LEMON_SQUEEZY_STORE_ID: '1',
    LEMON_SQUEEZY_PRO_VARIANT_ID: '2',
  });
  assert.equal(config.lemonConfigured, true);
  assert.equal(config.checkoutAvailable, true);
  assert.equal(config.enabled, true);
  assert.equal(config.proPriceUsd, PRO_PRICE_USD);
  assert.equal(config.stakeCents, stakeCentsFromEnv({}));
});

test('verifyLemonWebhookSignature validates HMAC hex', () => {
  const secret = 'whsec_test';
  const body = '{"meta":{"event_name":"order_created"}}';
  const good = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyLemonWebhookSignature(body, good, secret), true);
  assert.equal(verifyLemonWebhookSignature(body, 'deadbeef', secret), false);
  assert.equal(verifyLemonWebhookSignature(body, undefined, secret), false);
});
