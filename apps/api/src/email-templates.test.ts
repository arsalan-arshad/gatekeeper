import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMagicLinkEmail,
  buildOwnerNotificationEmail,
  buildReceiverOptInEmail,
} from './email-templates.ts';

test('magic link email is branded with button + plain text + footer', () => {
  const email = buildMagicLinkEmail({
    url: 'https://app.example/auth',
    env: { APP_URL: 'https://app.example' },
  });
  assert.match(email.subject, /Sign in/);
  assert.match(email.text, /https:\/\/app\.example\/auth/);
  assert.match(email.text, /Gatekeeper by Arsalan/);
  assert.match(email.text, /dashboard\/settings/);
  assert.match(email.html, /Sign in/);
  assert.match(email.html, /arsalandev\.studio/);
});

test('owner notification includes verdict and approve/decline', () => {
  const email = buildOwnerNotificationEmail({
    receiverName: 'Ada',
    senderName: 'Maya',
    senderType: 'human',
    message: 'Hello',
    score: 80,
    decision: 'accept',
    reasonPublic: 'Clear peer ask',
    approveUrl: 'https://api.example/accept',
    declineUrl: 'https://api.example/decline',
    inboxUrl: 'https://app.example/dashboard',
    env: { APP_URL: 'https://app.example' },
  });
  assert.match(email.text, /Approve:/);
  assert.match(email.text, /Decline:/);
  assert.match(email.text, /80\/100/);
  assert.match(email.html, /Approve intro/);
});

test('receiver opt-in email keeps double-opt-in copy', () => {
  const email = buildReceiverOptInEmail({
    receiverName: 'Ada',
    senderName: 'Maya',
    senderType: 'human',
    message: 'Hello',
    score: 70,
    acceptUrl: 'https://api.example/accept',
    declineUrl: 'https://api.example/decline',
    env: { APP_URL: 'https://app.example' },
  });
  assert.match(email.html, /Accept intro/);
  assert.match(email.text, /shared intro/);
});

test('opt-in HTML escapes XSS payload in senderName (S6)', () => {
  const xss = `<img src=x onerror=alert(1)>`;
  const email = buildReceiverOptInEmail({
    receiverName: 'Ada',
    senderName: xss,
    senderType: 'human',
    message: 'Hello',
    score: 70,
    acceptUrl: 'https://api.example/accept',
    declineUrl: 'https://api.example/decline',
    env: { APP_URL: 'https://app.example' },
  });
  assert.doesNotMatch(email.html, /<img src=x onerror/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(email.subject, /</);
});
