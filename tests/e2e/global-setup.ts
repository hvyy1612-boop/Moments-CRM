import { execSync } from 'node:child_process'

export default function globalSetup(): void {
  execSync('node scripts/reset-e2e-db.mjs', { stdio: 'inherit' })
  execSync('npx prisma db seed', { stdio: 'inherit' })
}
