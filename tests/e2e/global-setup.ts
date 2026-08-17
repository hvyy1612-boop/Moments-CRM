import { execSync } from 'node:child_process'

/**
 * Prepare a clean, deterministic database before the e2e run. First truncate every table so no
 * run inherits another run's rows (a shared resource booked at the same time would otherwise clash
 * across runs), then seed the known baseline. The Prisma CLI reads .env itself locally; in CI the
 * variables come from the workflow environment.
 */
export default function globalSetup(): void {
  execSync('node scripts/reset-e2e-db.mjs', { stdio: 'inherit' })
  execSync('npx prisma db seed', { stdio: 'inherit' })
}
