import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { recordDeliveryEvent } from '@/lib/domain/notifications'

export const runtime = 'nodejs'

/**
 * Resend delivery webhook (docs/25 Rule N8). Verifies the Svix signature, then records a delivery event
 * that is deduped by the Svix message id and reconciled to its dispatch by the provider message id. A
 * hard bounce / complaint suppresses the address so auto-reminders stop. Out-of-order and before-send
 * arrivals are tolerated by {@link recordDeliveryEvent}.
 */

const RESEND_TYPE_MAP: Record<string, 'delivered' | 'bounced' | 'complained'> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

/** Verify a Svix signature: HMAC-SHA256 over `${id}.${timestamp}.${body}` with the decoded secret. */
function verifySvix(secret: string, id: string, timestamp: string, body: string, header: string): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  // The header is space-separated `v1,<sig>` entries; any match counts.
  for (const part of header.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1]! : part
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const body = await req.text()

  if (secret) {
    const id = req.headers.get('svix-id')
    const timestamp = req.headers.get('svix-timestamp')
    const signature = req.headers.get('svix-signature')
    if (!id || !timestamp || !signature || !verifySvix(secret, id, timestamp, body, signature)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Never accept unverified webhooks in production.
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }

  let event: { type?: string; data?: { email_id?: string } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }

  const type = event.type ? RESEND_TYPE_MAP[event.type] : undefined
  const providerMessageId = event.data?.email_id
  const providerEventId = req.headers.get('svix-id') ?? `${event.type}:${providerMessageId}`
  if (!type || !providerMessageId) return NextResponse.json({ ok: true, ignored: true }) // not a delivery signal we track

  try {
    const res = await recordDeliveryEvent({ providerEventId, providerMessageId, type })
    return NextResponse.json({ ok: true, reconciled: res.reconciled })
  } catch (error) {
    logger.error('resend.webhook.error', { message: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
