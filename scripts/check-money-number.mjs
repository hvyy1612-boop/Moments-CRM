#!/usr/bin/env node
// §12.9 / BR-P03 / D6 — fail if the TypeScript `number` type is used for money.
//
// Heuristic: a property or variable whose name is monetary, annotated as `number`. Money must be
// Prisma.Decimal in code. Reports every offending file:line (DECISIONS.md D-007).
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
const MONEY =
  '(?:price|amount|total|subtotal|gross|net|gst|tax|fee|balance|deposit|discount|paid|payment|refund|priceGross|unitPrice|lineTotal)'
const RE = new RegExp(`\\b${MONEY}\\w*\\s*[?!]?\\s*:\\s*number\\b`, 'i')
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
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = RE.exec(line)
      if (m) violations.push({ file: rel, line: i + 1, match: m[0], text: line.trim() })
    })
}

walk(SRC)

if (violations.length > 0) {
  console.error('Money-as-number check FAILED (§12.9, BR-P03, D6) — use Prisma.Decimal, not number:')
  for (const v of violations) console.error(`  ${v.file}:${v.line}  "${v.match}"\n    ${v.text}`)
  process.exit(1)
}
console.log('Money-as-number check passed: no monetary value typed as number.')
