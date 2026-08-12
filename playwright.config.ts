import { defineConfig } from '@playwright/test'

const E2E_PORT = 3100

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',

  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: `http://localhost:${E2E_PORT}`,

    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(E2E_PORT),

      NEXT_DIST_DIR: '.next-e2e',

      SESSION_SECRET:
        process.env.SESSION_SECRET ?? 'e2e-test-session-secret-not-for-production-use-0123456789',

      CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret-not-for-production-use',
    },
  },
})
