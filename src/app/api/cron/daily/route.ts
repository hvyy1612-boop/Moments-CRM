import { NextResponse, type NextRequest } from 'next/server'
import { runDailyJob } from '@/lib/domain/scheduler'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET

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
