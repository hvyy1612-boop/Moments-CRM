import { defineConfig } from '@playwright/test'

/**
 * E2E runs against a production build (build + start), which is closest to how Vercel serves the
 * app and keeps the console clean for the "no console errors" smoke test (§12.14). A local Postgres
 * must be running for the /api/health check to pass.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
