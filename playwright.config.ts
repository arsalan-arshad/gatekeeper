import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm e2e:serve',
        url: `${baseURL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          ...process.env,
          PORT: String(PORT),
          APP_URL: baseURL,
          AUTH_URL: baseURL,
          E2E_ENABLED: '1',
          E2E_SECRET: process.env.E2E_SECRET || 'local-e2e-secret',
          AUTH_SECRET: process.env.AUTH_SECRET || 'e2e-auth-secret-for-tests-only',
          // Never production — e2e login hard-gates on NODE_ENV !== 'production'.
          NODE_ENV:
            process.env.NODE_ENV === 'production' ? 'test' : process.env.NODE_ENV || 'development',
          INTERNAL_API_SECRET:
            process.env.INTERNAL_API_SECRET || 'e2e-internal-api-secret-for-tests-only',
          API_URL: process.env.API_URL || 'http://127.0.0.1:4000',
          NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000',
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || baseURL,
        },
      },
});
