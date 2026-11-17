import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from './delete-user-args.ts';

test('parseArgs reads handle after pnpm -- separator', () => {
  assert.deepEqual(parseArgs(['--', 'Arsalan-A-Software-Engin']), {
    handle: 'arsalan-a-software-engin',
    yes: false,
    help: false,
  });
});

test('parseArgs accepts --yes before or after handle', () => {
  assert.equal(parseArgs(['my-handle', '--yes']).yes, true);
  assert.equal(parseArgs(['--yes', 'my-handle']).yes, true);
  assert.equal(parseArgs(['--', 'my-handle', '--yes']).handle, 'my-handle');
});

test('parseArgs recognizes help flags', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('parseArgs requires a positional handle', () => {
  assert.equal(parseArgs([]).handle, '');
  assert.equal(parseArgs(['--yes']).handle, '');
});
