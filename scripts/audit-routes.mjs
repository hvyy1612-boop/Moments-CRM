#!/usr/bin/env node

import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP = 'src/app'
const REGISTRY = 'src/lib/auth/permissions.ts'

const files = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\/(?:route|page)\.tsx?$/.test('/' + p.replace(/\\/g, '/'))) files.push(p)
  }
}

function routeId(file) {
  let rel = relative(APP, file)
    .replace(/\\/g, '/')
    .replace(/(?:^|\/)(?:route|page)\.tsx?$/, '')
  rel = rel
    .split('/')
    .filter((seg) => seg && !/^\(.*\)$/.test(seg))
    .join('/')
  return '/' + rel
}

walk(APP)

const registry = readFileSync(REGISTRY, 'utf8')
const missing = []
for (const file of files) {
  const id = routeId(file)
  const key = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`['"\`]${key}['"\`]\\s*:`)
  if (!re.test(registry)) missing.push({ file: file.replace(/\\/g, '/'), id })
}

if (missing.length > 0) {
  console.error('Route permission audit FAILED (§12.6, SEC-A01) — routes with no declaration:')
  for (const m of missing) {
    console.error(`  ${m.file}:1  no permission declared for route "${m.id}" in ${REGISTRY}`)
  }
  process.exit(1)
}
console.log(`Route permission audit passed: ${files.length} route(s), all declared.`)
