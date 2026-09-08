#!/usr/bin/env node

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
