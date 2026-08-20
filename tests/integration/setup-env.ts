import { existsSync, readFileSync } from 'node:fs'

// Integration tests run domain logic against the real local database. Next.js loads .env for the
// app, but a bare vitest process does not — so load it here (without overriding anything already
// set in the environment, e.g. a CI-provided DATABASE_URL).
if (existsSync('.env')) {
  for (const raw of readFileSync('.env', 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
