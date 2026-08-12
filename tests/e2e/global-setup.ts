import { execSync } from 'node:child_process'

/**
 * Seed before the e2e run. The seed is idempotent and resets the test users' passwords and
 * lockout counters (prisma/seed.ts), so every run starts from the same known state. The Prisma
 * CLI reads .env itself locally; in CI the variables come from the workflow environment.
 */
export default function globalSetup(): void {
  execSync('npx prisma db seed', { stdio: 'inherit' })
}
