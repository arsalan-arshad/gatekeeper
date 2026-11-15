import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeEmailSubject } from './email-subject.ts';

test('sanitizeEmailSubject strips CR/LF header injection', () => {
  assert.equal(
    sanitizeEmailSubject('Hello\r\nBcc: evil@example.com'),
    'Hello Bcc: evil@example.com',
  );
});

test('sanitizeEmailSubject strips HTML tags', () => {
  assert.equal(sanitizeEmailSubject('Hi <script>alert(1)</script> there'), 'Hi alert(1) there');
});

test('sanitizeEmailSubject trims and caps length', () => {
  const long = 'a'.repeat(300);
  assert.equal(sanitizeEmailSubject(`  ${long}  `).length, 200);
});
