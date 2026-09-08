import { existsSync, readFileSync } from 'node:fs'
import { assertTestDatabaseUrl, readDotenvValue } from './assert-test-db'

/**
 * Integration tests run domain logic against a REAL database — but ONLY ever a throwaway TEST one.
 * `TEST_DATABASE_URL` is mandatory; there is deliberately NO fallback to `.env` / production
 * (docs/25 Rule G3). We read the app's production `DATABASE_URL` from `.env` purely as a reference to
 * refuse when the test target is the same database.
 */
const productionUrl = existsSync('.env') ? readDotenvValue('DATABASE_URL', readFileSync('.env', 'utf8')) : undefined
const testUrl = process.env.TEST_DATABASE_URL
const { masked } = assertTestDatabaseUrl({ testUrl, productionUrl })

// Point Prisma at the verified TEST database for this process only.
process.env.DATABASE_URL = testUrl!
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL ?? testUrl!

// No real side-effects from integration tests: disable email + any external providers regardless of
// what .env contains, so a test branch with copied data can never email real clients or hit Stripe.
delete process.env.RESEND_API_KEY
delete process.env.EMAIL_FROM
delete process.env.STRIPE_SECRET_KEY
delete process.env.STRIPE_WEBHOOK_SECRET

console.log(`[integration] TEST database verified: ${masked} — email/providers disabled`)
