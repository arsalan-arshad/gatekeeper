import assert from 'node:assert/strict';
import { test } from 'node:test';

import { introContactNeedsVerification, resolveIntroContactEmail } from './contact-email.ts';
import { createIntroContactVerifyToken, verifyIntroContactVerifyToken } from './tokens.ts';

const SECRET = 'intro-contact-verify-secret-32chars!!';

test('resolveIntroContactEmail ignores unverified alternate and global-style verified flags', () => {
  const login = 'owner@example.com';
  // Unverified alternate must never be used — even if that address exists in
  // verified_senders globally (hijack vector).
  assert.equal(
    resolveIntroContactEmail({
      email: login,
      introContactEmail: 'victim@example.com',
      introContactVerifiedAt: null,
    }),
    login,
  );
  assert.equal(
    resolveIntroContactEmail({
      email: login,
      introContactEmail: 'victim@example.com',
      introContactVerifiedAt: undefined,
    }),
    login,
  );
});

test('resolveIntroContactEmail uses alternate only after user-scoped verification', () => {
  const login = 'owner@example.com';
  const alt = 'work@example.com';
  assert.equal(
    resolveIntroContactEmail({
      email: login,
      introContactEmail: alt,
      introContactVerifiedAt: new Date(),
    }),
    alt,
  );
  assert.equal(
    resolveIntroContactEmail({
      email: login,
      introContactEmail: login,
      introContactVerifiedAt: new Date(),
    }),
    login,
  );
  assert.equal(
    resolveIntroContactEmail({
      email: login,
      introContactEmail: null,
      introContactVerifiedAt: new Date(),
    }),
    login,
  );
});

test('introContactNeedsVerification reflects pending ownership proof', () => {
  assert.equal(
    introContactNeedsVerification({
      email: 'a@x.com',
      introContactEmail: 'b@x.com',
      introContactVerifiedAt: null,
    }),
    true,
  );
  assert.equal(
    introContactNeedsVerification({
      email: 'a@x.com',
      introContactEmail: 'b@x.com',
      introContactVerifiedAt: new Date(),
    }),
    false,
  );
  assert.equal(
    introContactNeedsVerification({
      email: 'a@x.com',
      introContactEmail: 'a@x.com',
      introContactVerifiedAt: null,
    }),
    false,
  );
});

test('intro contact verify tokens bind userId+email and reject mismatches', () => {
  const env = { EMAIL_LINK_SECRET: SECRET };
  const token = createIntroContactVerifyToken(
    { userId: 'user-1', email: 'Work@Example.com' },
    { env },
  );
  const ok = verifyIntroContactVerifyToken(token, { env });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.payload.userId, 'user-1');
    assert.equal(ok.payload.email, 'work@example.com');
    assert.equal(ok.payload.purpose, 'intro_contact_verify');
  }

  const expired = createIntroContactVerifyToken(
    { userId: 'user-1', email: 'work@example.com', exp: 1 },
    { env },
  );
  const bad = verifyIntroContactVerifyToken(expired, { env });
  assert.equal(bad.ok, false);
});
