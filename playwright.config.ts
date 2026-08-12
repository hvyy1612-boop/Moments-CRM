import { defineConfig } from '@playwright/test'

/**
 * E2E runs against a production build (build + start), which is closest to how Vercel serves the
 * app and keeps the console clean for the "no console errors" smoke test (§12.14). A local Postgres
 * must be running for the /api/health check to pass.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // Sign-in is deliberately expensive: Argon2id at 19 MiB per verification (SEC-P01), plus a
  // second dummy verification on failure so unknown accounts take the same time (SEC-S05). With
  // several workers signing in at once the default 5s assertion window is genuinely too tight, so
  // it is widened rather than papered over with retries, which would hide real flakiness.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // The e2e server runs a production build, where SESSION_SECRET is required (SEC-A08, env.ts).
      // Provide a throwaway secret so the server boots in local and CI runs; real deployments set
      // their own. Playwright merges this over process.env, so a CI-provided value still wins.
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? 'e2e-test-session-secret-not-for-production-use-0123456789',
    },
  },
})
