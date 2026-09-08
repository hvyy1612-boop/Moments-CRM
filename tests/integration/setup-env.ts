import { existsSync, readFileSync } from 'node:fs'
import { assertTestDatabaseUrl, readDotenvValue } from './assert-test-db'

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

process.env.DATABASE_URL = testUrl!
process.env.DIRECT_URL = testDirectUrl ?? testUrl!

delete process.env.RESEND_API_KEY
delete process.env.EMAIL_FROM
delete process.env.STRIPE_SECRET_KEY
delete process.env.STRIPE_WEBHOOK_SECRET

console.log(`[integration] TEST database verified: ${masked} — email/providers disabled`)
