

import { existsSync, readFileSync } from 'node:fs'

export function readEnvFile(file, key) {
  if (!existsSync(file)) return undefined
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
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

export function resolveTestVar(key) {
  const fromEnv = process.env[key]
  if (fromEnv && fromEnv.trim()) return fromEnv
  return readEnvFile('.env.test', key)
}

export function parseTarget(url) {
  try {
    const u = new URL(url)
    return u.hostname ? { host: u.hostname.toLowerCase(), db: u.pathname.replace(/^\//, '').split('?')[0] } : null
  } catch {
    return null
  }
}

export function mask(url) {
  const t = parseTarget(url)
  return t ? `postgres://***@${t.host}/${t.db || '(no-db)'}` : '(unparseable database url)'
}

export function sameTarget(a, b) {
  const pa = parseTarget(a)
  const pb = parseTarget(b)
  return Boolean(pa) && Boolean(pb) && pa.host === pb.host && pa.db === pb.db
}

export function assertTestUrl() {
  const testUrl = resolveTestVar('TEST_DATABASE_URL')
  const prodUrl = readEnvFile('.env', 'DATABASE_URL')
  if (!testUrl || !testUrl.trim()) {
    return { ok: false, reason: 'TEST_DATABASE_URL is required — no fallback to .env / production. Set it in the environment or a git-ignored .env.test.' }
  }
  if (!parseTarget(testUrl)) {
    return { ok: false, reason: 'TEST_DATABASE_URL is not a valid database URL (unknown target).' }
  }
  if (prodUrl && sameTarget(testUrl, prodUrl)) {
    return { ok: false, reason: `TEST_DATABASE_URL is the SAME database as production (${mask(testUrl)}).` }
  }
  return { ok: true, testUrl, directUrl: resolveTestVar('TEST_DIRECT_URL') ?? testUrl, masked: mask(testUrl) }
}
