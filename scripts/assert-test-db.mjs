#!/usr/bin/env node
// CLI preflight for TEST-only migrations / seeds / cleanup (docs/25 Rule G3). Mirrors the checks in
// tests/integration/assert-test-db.ts. Refuses when TEST_DATABASE_URL is missing, unparseable, or the
// same database as production (.env DATABASE_URL). Prints the masked target; exits 1 on refusal so a
// chained command (e.g. prisma migrate) never runs against the wrong database.
//
//   node scripts/assert-test-db.mjs
//   npm run test:db:migrate   # runs this first, then migrates against TEST_DATABASE_URL only
import { existsSync, readFileSync } from 'node:fs'

const parse = (url) => {
  try {
    const u = new URL(url)
    return u.hostname ? { host: u.hostname.toLowerCase(), db: u.pathname.replace(/^\//, '').split('?')[0] } : null
  } catch {
    return null
  }
}
const mask = (url) => {
  const t = parse(url)
  return t ? `postgres://***@${t.host}/${t.db || '(no-db)'}` : '(unparseable database url)'
}
const same = (a, b) => {
  const pa = parse(a)
  const pb = parse(b)
  return Boolean(pa) && Boolean(pb) && pa.host === pb.host && pa.db === pb.db
}
const readEnv = (key) => {
  if (!existsSync('.env')) return undefined
  for (const raw of readFileSync('.env', 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1 || line.slice(0, eq).trim() !== key) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    return v
  }
  return undefined
}

const testUrl = process.env.TEST_DATABASE_URL
const prodUrl = readEnv('DATABASE_URL')

if (!testUrl || !testUrl.trim()) {
  console.error('REFUSED: TEST_DATABASE_URL is required — no fallback to .env / production.')
  process.exit(1)
}
if (!parse(testUrl)) {
  console.error('REFUSED: TEST_DATABASE_URL is not a valid database URL (unknown target).')
  process.exit(1)
}
if (prodUrl && same(testUrl, prodUrl)) {
  console.error(`REFUSED: TEST_DATABASE_URL is the SAME database as production (${mask(testUrl)}).`)
  process.exit(1)
}
console.log(`OK: test database target ${mask(testUrl)}`)
