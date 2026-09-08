#!/usr/bin/env node
// CLI preflight for TEST-only migrations / seeds / cleanup (docs/25 Rule G3). Resolves TEST_DATABASE_URL
// from the process env or a git-ignored .env.test, and refuses when it is missing, unparseable, or the
// same database as production (.env DATABASE_URL). Prints the masked target; exits 1 on refusal so a
// chained command never runs against the wrong database.
//
//   node scripts/assert-test-db.mjs
import { assertTestUrl } from './lib/test-db.mjs'

const result = assertTestUrl()
if (!result.ok) {
  console.error(`REFUSED: ${result.reason}`)
  process.exit(1)
}
console.log(`OK: test database target ${result.masked}`)
