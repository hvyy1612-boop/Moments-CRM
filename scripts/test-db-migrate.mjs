#!/usr/bin/env node
// Migrate ONLY the TEST database (docs/25 Rule G3). Resolves TEST_DATABASE_URL from the process env or
// a git-ignored .env.test, refuses production, then runs `prisma migrate deploy` in a child process
// with DATABASE_URL/DIRECT_URL set to the test target — never touching the app's .env / production.
//
//   npm run test:db:migrate
import { spawnSync } from 'node:child_process'
import { assertTestUrl } from './lib/test-db.mjs'

const result = assertTestUrl()
if (!result.ok) {
  console.error(`REFUSED: ${result.reason}`)
  process.exit(1)
}

console.log(`Migrating TEST database ${result.masked} …`)
const child = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: result.testUrl, DIRECT_URL: result.directUrl },
})
process.exit(child.status ?? 1)
