import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('DEP-003 pnpm overrides bump vulnerable minimatch (>=7) to patched', async () => {
  const rootPkgPath = fileURLToPath(new URL('../../../package.json', import.meta.url));
  const lockPath = fileURLToPath(new URL('../../../pnpm-lock.yaml', import.meta.url));
  const pkg = JSON.parse(await readFile(rootPkgPath, 'utf8')) as {
    pnpm?: { overrides?: Record<string, string> };
  };
  const overrides = pkg.pnpm?.overrides ?? {};
  assert.ok(
    overrides['minimatch@>=7'] === '>=11.0.1' || overrides.minimatch === '>=11.0.1',
    'expected minimatch override to patched >=11.0.1',
  );

  const lock = await readFile(lockPath, 'utf8');
  // Vulnerable modern line must not remain after override + install.
  assert.doesNotMatch(lock, /^ {2}minimatch@10\./m);
  assert.match(lock, /^ {2}minimatch@11\./m);
});
