#!/usr/bin/env node
/**
 * Start API + web for Playwright. Expects DATABASE_URL and E2E_SECRET.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const env = {
  ...process.env,
  AUTH_SECRET: process.env.AUTH_SECRET || 'e2e-auth-secret-for-tests-only',
  E2E_SECRET: process.env.E2E_SECRET || 'local-e2e-secret',
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || 'e2e-internal-api-secret-for-tests-only',
  APP_URL: process.env.APP_URL || 'http://127.0.0.1:3000',
  AUTH_URL: process.env.AUTH_URL || 'http://127.0.0.1:3000',
  API_URL: process.env.API_URL || 'http://127.0.0.1:4000',
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000',
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://127.0.0.1:3000',
  PORT: process.env.PORT || '3000',
};

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    if (code && code !== 0) process.exit(code);
  });
  return child;
}

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is required for e2e:serve');
    process.exit(1);
  }

  console.info('[e2e] migrating database…');
  await new Promise((resolve, reject) => {
    const mig = spawn('pnpm', ['--filter', '@gatekeeper/db', 'db:migrate'], {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    });
    mig.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`migrate exit ${code}`))));
  });

  console.info('[e2e] starting API…');
  run('pnpm', ['--filter', '@gatekeeper/api', 'dev'], { PORT: '4000' });
  await waitFor('http://127.0.0.1:4000/health');

  console.info('[e2e] starting web…');
  run('pnpm', ['--filter', '@gatekeeper/web', 'dev'], { PORT: env.PORT });
  await waitFor(`http://127.0.0.1:${env.PORT}/`);

  // Keep process alive for Playwright webServer.
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
