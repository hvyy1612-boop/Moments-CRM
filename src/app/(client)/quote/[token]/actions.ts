'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { decideQuotation } from '@/lib/domain/quotation'
import { requestMeta } from '@/lib/http'

export type DecisionState = { status: 'idle' } | { status: 'error'; message: string }

/**
 * The client's decision. There is no session here: the single-use action token IS the
 * authorisation (BR-T02, BR-T03), and it is consumed atomically inside decideQuotation.
 */
const decisionSchema = z.object({
  intent: z.enum(['accept', 'decline']),
  acceptToken: z.string().min(1).max(200),
  declineToken: z.string().min(1).max(200),
  // The page the client returns to. Its own route already renders the settled state, so there is
  // no separate confirmation URL to collide with the [token] segment.
  viewToken: z.string().min(1).max(200),
  acceptedName: z.string().trim().max(120).optional(),
  acknowledged: z.literal('on').optional(),
})

export async function decide(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse({
    intent: formData.get('intent'),
    acceptToken: formData.get('acceptToken'),
    declineToken: formData.get('declineToken'),
    viewToken: formData.get('viewToken'),
    acceptedName: formData.get('acceptedName') ?? undefined,
    acknowledged: formData.get('acknowledged') ?? undefined,
  })
  if (!parsed.success) {
    return { status: 'error', message: 'Something was missing from that request.' }
  }

  const accepting = parsed.data.intent === 'accept'

  // BR-P15 again on the server: the interface disables the button, but the rule is enforced here.
  if (accepting && parsed.data.acknowledged !== 'on') {
    return { status: 'error', message: 'Please tick the box to say you have read the terms.' }
  }
  if (accepting && !parsed.data.acceptedName) {
    return { status: 'error', message: 'Please enter your name so it can be recorded.' }
  }

  const meta = await requestMeta()
  const result = await decideQuotation(
    {
      token: accepting ? parsed.data.acceptToken : parsed.data.declineToken,
      action: accepting ? 'ACCEPT' : 'DECLINE',
      acceptedName: parsed.data.acceptedName,
    },
    { ipAddress: meta.ipAddress },
  )

  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? 'This page has been open a while and the link has timed out. Reload it and try again.'
        : result.reason === 'not_sent'
          ? 'This quotation is no longer open for a decision.'
          : 'That link is not valid. Please use the most recent one the studio sent you.'
    return { status: 'error', message }
  }

  // Back to their own page, which now renders the settled state.
  redirect(`/quote/${parsed.data.viewToken}`)
}
