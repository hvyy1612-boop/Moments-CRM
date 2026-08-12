import { NextResponse, type NextRequest } from 'next/server'
import { runDailyJob } from '@/lib/domain/scheduler'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
// Never cached: it changes state on every call.
export const dynamic = 'force-dynamic'

/**
 * The nightly job, invoked by GitHub Actions cron (D-014).
 *
 * Protected by a shared secret in the Authorization header, compared in constant time. The job
 * itself is idempotent (BR-X08), so a retry after a network failure is safe and a double run
 * queues nothing twice.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // With no secret configured the endpoint is closed rather than open. Failing open on a
  // state-changing endpoint would be the worse default.
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (header.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    // SEC-A07: no hint about whether the secret is unset or simply wrong.
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  try {
    const result = await runDailyJob()
    logger.info('cron.daily.completed', result)
    return NextResponse.json({ status: 'ok', ...result })
  } catch (error) {
    logger.error('cron.daily.failed', { error: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'The job failed' }, { status: 500 })
  }
}
