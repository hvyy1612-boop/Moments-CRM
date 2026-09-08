/**
 * Test-database guardrail (docs/25 Rule G3 safety). Integration tests, migrations, seeds and cleanup
 * MUST run against a throwaway TEST database supplied via `TEST_DATABASE_URL` — never the app's
 * `.env` / production `DATABASE_URL`. There is NO fallback: a missing, unparseable, or
 * production-matching target refuses to run. Credentials are always masked in output.
 */

export type DbTarget = { host: string; port: string; database: string }

/** Parse a Postgres connection URL into a comparable target (or null if unparseable). */
export function parseDbTarget(url: string): DbTarget | null {
  try {
    const u = new URL(url)
    if (!u.hostname) return null
    return {
      host: u.hostname.toLowerCase(),
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '').split('?')[0] ?? '',
    }
  } catch {
    return null
  }
}

/** A log-safe form of a database URL: host + database only, credentials removed. */
export function maskDbUrl(url: string): string {
  const t = parseDbTarget(url)
  return t ? `postgres://***@${t.host}/${t.database || '(no-db)'}` : '(unparseable database url)'
}

/** Two URLs point at the same data when host AND database name match (ignores credentials/params). */
export function isSameDatabaseTarget(a: string, b: string): boolean {
  const pa = parseDbTarget(a)
  const pb = parseDbTarget(b)
  if (!pa || !pb) return false
  return pa.host === pb.host && pa.database === pb.database
}

/**
 * Assert that `testUrl` is a usable, distinct-from-production test database. Throws (never returns a
 * fallback) when it is missing, unparseable, or the same target as `productionUrl`.
 */
export function assertTestDatabaseUrl(input: {
  testUrl: string | undefined
  productionUrl?: string | undefined
}): { masked: string } {
  const { testUrl, productionUrl } = input
  if (!testUrl || !testUrl.trim()) {
    throw new Error(
      'TEST_DATABASE_URL is required — refusing to fall back to .env / production. Set TEST_DATABASE_URL ' +
        'to a throwaway Neon test branch or a local Postgres before running tests, migrations or seeds.',
    )
  }
  if (!parseDbTarget(testUrl)) {
    throw new Error('TEST_DATABASE_URL is not a valid PostgreSQL URL; refusing to run against an unknown target.')
  }
  if (productionUrl && isSameDatabaseTarget(testUrl, productionUrl)) {
    throw new Error(`TEST_DATABASE_URL points at the SAME database as production (${maskDbUrl(testUrl)}); refusing to run.`)
  }
  return { masked: maskDbUrl(testUrl) }
}

/** Read one key from dotenv contents WITHOUT mutating process.env (used only as a production reference). */
export function readDotenvValue(key: string, contents: string): string | undefined {
  for (const raw of contents.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1 || line.slice(0, eq).trim() !== key) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value
  }
  return undefined
}
