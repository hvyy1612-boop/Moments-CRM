import { describe, expect, it } from 'vitest'
import {
  assertTestDatabaseUrl,
  isSameDatabaseTarget,
  maskDbUrl,
  readDotenvValue,
} from '../integration/assert-test-db'

const PROD = 'postgresql://user:secret@ep-prod.neon.tech/neondb?sslmode=require'
const TEST_BRANCH = 'postgresql://user:secret@ep-test-branch.neon.tech/neondb?sslmode=require'

describe('test-database guardrail (docs/25 Rule G3 safety)', () => {
  it('refuses when TEST_DATABASE_URL is missing — no fallback to production', () => {
    expect(() => assertTestDatabaseUrl({ testUrl: undefined, productionUrl: PROD })).toThrow(/TEST_DATABASE_URL is required/)
    expect(() => assertTestDatabaseUrl({ testUrl: '   ', productionUrl: PROD })).toThrow(/required/)
  })

  it('refuses an unparseable / unknown target', () => {
    expect(() => assertTestDatabaseUrl({ testUrl: 'not-a-url', productionUrl: PROD })).toThrow(/unknown target|not a valid/i)
  })

  it('refuses when the target is the SAME database as production (host + db match)', () => {
    expect(() => assertTestDatabaseUrl({ testUrl: PROD, productionUrl: PROD })).toThrow(/SAME database as production/)
  })

  it('accepts a distinct test target (different host / branch)', () => {
    const { masked } = assertTestDatabaseUrl({ testUrl: TEST_BRANCH, productionUrl: PROD })
    expect(masked).toContain('ep-test-branch.neon.tech')
  })

  it('accepts a test target when there is no known production reference', () => {
    expect(() => assertTestDatabaseUrl({ testUrl: TEST_BRANCH, productionUrl: undefined })).not.toThrow()
  })

  it('masks credentials in all output', () => {
    expect(maskDbUrl(PROD)).toBe('postgres://***@ep-prod.neon.tech/neondb')
    expect(maskDbUrl(PROD)).not.toContain('secret')
  })

  it('isSameDatabaseTarget compares host + database only', () => {
    expect(isSameDatabaseTarget(PROD, PROD)).toBe(true)
    expect(isSameDatabaseTarget(PROD, TEST_BRANCH)).toBe(false)
    expect(isSameDatabaseTarget('postgresql://u:p@h/a', 'postgresql://u:p@h/b')).toBe(false) // same host, different db
  })

  it('readDotenvValue extracts a key, honoring quotes and comments, without mutating env', () => {
    const env = '# comment\nDATABASE_URL="postgres://x"\nOTHER=1\n'
    expect(readDotenvValue('DATABASE_URL', env)).toBe('postgres://x')
    expect(readDotenvValue('MISSING', env)).toBeUndefined()
  })
})
