import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clearConsoleEmailLog, createConsoleEmailSender, getConsoleEmailLog } from './email.ts';
import { EmailSendError } from './email.ts';
import { sendMatchIntroEmail } from './match-intro.ts';
import {
  countMatchOutboundEmailsForTests,
  MATCH_EMAIL_TYPES,
  resetMatchOutboundEmailsForTests,
  useMemoryMatchOutboundEmailsForTests,
} from './match-outbound-email.ts';

test('match intro claims once under concurrent sends; failure releases slot', async () => {
  useMemoryMatchOutboundEmailsForTests(true);
  resetMatchOutboundEmailsForTests();
  clearConsoleEmailLog();

  const send = createConsoleEmailSender();
  const input = {
    send,
    matchId: 'match-1',
    note: 'We should collaborate on mobile hiring workflows.',
    personA: {
      name: 'Ada',
      contactEmail: 'ada@example.com',
      summary: 'Founder',
    },
    personB: {
      name: 'Bob',
      contactEmail: 'bob@example.com',
      summary: 'Engineer',
    },
  };

  const results = await Promise.all([
    sendMatchIntroEmail(input),
    sendMatchIntroEmail(input),
    sendMatchIntroEmail(input),
  ]);
  assert.equal(results.filter((r) => r === 'sent').length, 1);
  assert.equal(results.filter((r) => r === 'skipped').length, 2);
  assert.equal(countMatchOutboundEmailsForTests(MATCH_EMAIL_TYPES.matchIntro), 1);
  assert.equal(getConsoleEmailLog().length, 1);
  assert.deepEqual(getConsoleEmailLog()[0]?.replyTo, ['ada@example.com', 'bob@example.com']);

  // Simulate failure path: release + resend
  resetMatchOutboundEmailsForTests();
  let calls = 0;
  const failingSend = async () => {
    calls += 1;
    throw new EmailSendError(500, 'server_error');
  };
  const failed = await sendMatchIntroEmail({ ...input, send: failingSend });
  assert.equal(failed, 'failed');
  assert.equal(countMatchOutboundEmailsForTests(MATCH_EMAIL_TYPES.matchIntro), 0);

  const resent = await sendMatchIntroEmail(input);
  assert.equal(resent, 'sent');
  assert.equal(calls, 1);
});
