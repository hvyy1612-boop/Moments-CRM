import { existsSync, readFileSync } from 'node:fs'
import { assertTestDatabaseUrl, readDotenvValue } from './assert-test-db'

/**
 * Integration tests run domain logic against a REAL database — but ONLY ever a throwaway TEST one.
 * `TEST_DATABASE_URL` is mandatory and comes from the process env OR a git-ignored `.env.test` file
 * (so the secret is never pasted into chat or committed). There is deliberately NO fallback to
 * `.env` / production (docs/25 Rule G3); `.env` is read only as a reference to refuse a same-target.
 */
const dotenvTest = existsSync('.env.test') ? readFileSync('.env.test', 'utf8') : ''
function fromEnvOrTestFile(key: string): string | undefined {
  const fromEnv = process.env[key]
  if (fromEnv && fromEnv.trim()) return fromEnv
  return dotenvTest ? readDotenvValue(key, dotenvTest) : undefined
}

const productionUrl = existsSync('.env') ? readDotenvValue('DATABASE_URL', readFileSync('.env', 'utf8')) : undefined
const testUrl = fromEnvOrTestFile('TEST_DATABASE_URL')
const testDirectUrl = fromEnvOrTestFile('TEST_DIRECT_URL')
const { masked } = assertTestDatabaseUrl({ testUrl, productionUrl })

// Point Prisma at the verified TEST database for this process only.
process.env.DATABASE_URL = testUrl!
process.env.DIRECT_URL = testDirectUrl ?? testUrl!

// No real side-effects from integration tests: disable email + external providers regardless of what
// .env / .env.test contain, so a test branch with copied data can never email real clients or hit Stripe.
delete process.env.RESEND_API_KEY
delete process.env.EMAIL_FROM
delete process.env.STRIPE_SECRET_KEY
delete process.env.STRIPE_WEBHOOK_SECRET

console.log(`[integration] TEST database verified: ${masked} — email/providers disabled`)
