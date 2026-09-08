#!/usr/bin/env node

import { assertTestUrl } from './lib/test-db.mjs'

const result = assertTestUrl()
if (!result.ok) {
  console.error(`REFUSED: ${result.reason}`)
  process.exit(1)
}
console.log(`OK: test database target ${result.masked}`)
