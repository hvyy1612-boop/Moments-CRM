#!/usr/bin/env node
// §12.7 / SEC-P03 — fail if a handler can serialise a passwordHash.
//
// Rule A: `passwordHash` must not appear anywhere under src/app (route handlers and UI) — that is
//         where data is serialised to the client.
// Rule B: `passwordHash: true` (a Prisma select of the hash) must not appear anywhere in src.
// Allowlist: src/lib/auth/** legitimately references passwordHash (hashing and verification).
//
// Reports every offending file:line, not just a non-zero exit (DECISIONS.md D-007).
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
const ALLOW = [/^src\/lib\/auth\//]
const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(p)) scan(p)
  }
}

function scan(file) {
  const rel = file.replace(/\\/g, '/')
  const allowed = ALLOW.some((re) => re.test(rel))
  const inApp = rel.startsWith('src/app/')
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (inApp && /passwordHash/.test(line)) {
        violations.push({ file: rel, line: i + 1, why: 'passwordHash referenced in a route/UI file', text: line.trim() })
      } else if (!allowed && /passwordHash\s*:\s*true/.test(line)) {
        violations.push({ file: rel, line: i + 1, why: 'Prisma select of passwordHash', text: line.trim() })
      }
    })
}

walk(SRC)

if (violations.length > 0) {
  console.error('passwordHash check FAILED (§12.7, SEC-P03):')
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.why}\n    ${v.text}`)
  process.exit(1)
}
console.log('passwordHash check passed: no handler can serialise passwordHash.')
