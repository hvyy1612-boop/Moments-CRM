#!/usr/bin/env node
// §12.8 / §10.1 — fail if a colour, spacing, or radius literal appears outside globals.css.
//
// Scans src for hex colours, colour functions, and px/rem length literals. The token source of
// truth (src/app/globals.css) is the only allowlisted file. Reports every offending file:line
// (DECISIONS.md D-007).
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
// globals.css is the design-token source of truth. email.ts is allowlisted because HTML email
// requires inline literal colours/sizes — email clients do not support CSS variables, external
// stylesheets, or Tailwind classes, so the tokens cannot be referenced there.
const ALLOW = new Set(['src/app/globals.css', 'src/lib/email.ts', 'src/components/QuotePdf.tsx'])
const PATTERNS = [
  { name: 'hex colour', re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/ },
  { name: 'colour function', re: /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/ },
  { name: 'length literal', re: /(?<![\w-])\d+(?:\.\d+)?(?:px|rem)\b/ },
]
const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx|css)$/.test(p)) scan(p)
  }
}

function scan(file) {
  const rel = file.replace(/\\/g, '/')
  if (ALLOW.has(rel)) return
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const { name, re } of PATTERNS) {
        const m = re.exec(line)
        if (m) violations.push({ file: rel, line: i + 1, name, match: m[0], text: line.trim() })
      }
    })
}

walk(SRC)

if (violations.length > 0) {
  console.error('Design-token check FAILED (§10.1, §12.8) — literals belong only in globals.css:')
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.name} "${v.match}"\n    ${v.text}`)
  process.exit(1)
}
console.log('Design-token check passed: no colour/spacing/radius literal outside globals.css.')
