'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { logActivity } from '@/lib/domain/activity-log'
import { requestMeta } from '@/lib/http'
import { systemClock } from '@/lib/time'
import { QUESTIONS, questionnaireSchema } from '@/lib/validation/questionnaire'

export type QuestionnaireState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }

/**
 * The couple submitting their planning questionnaire (BR-QN03, BR-CP04).
 *
 * There is no session here. The portal token in the URL is the authorisation, and it is re-read
 * from the form rather than trusted from anywhere else: this action can only ever touch the
 * booking that token belongs to.
 */
export async function submitQuestionnaire(
  _prev: QuestionnaireState,
  formData: FormData,
): Promise<QuestionnaireState> {
  const token = formData.get('token')
  if (typeof token !== 'string' || token.length === 0) {
    return { status: 'error', message: 'That link is not valid. Reload the page and try again.' }
  }

  const booking = await prisma.booking.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      status: true,
      clientId: true,
      shootDate: true,
      questionnaire: { select: { id: true, status: true, submittedAt: true } },
    },
  })
  // Same answer for an unknown token and a cancelled booking: nothing to probe (BR-CP05, SEC-A07).
  if (!booking || booking.status === 'CANCELLED') {
    return { status: 'error', message: 'That link is not valid. Reload the page and try again.' }
  }

  const now = systemClock.now()
  // BR-QN03: answers may be changed up to the shoot. After the day they are history, not a form.
  if (now.getTime() > booking.shootDate.getTime()) {
    return {
      status: 'error',
      message: 'The shoot has already happened, so these answers can no longer be changed.',
    }
  }

  // SEC-A02: validated on the server, and `.strict()` rejects any key that is not a question.
  const submitted = Object.fromEntries(
    QUESTIONS.map((question) => [question.key, String(formData.get(question.key) ?? '')]),
  )
  const parsed = questionnaireSchema.safeParse(submitted)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { status: 'error', message: 'Some answers need a look.', fieldErrors }
  }

  const first = booking.questionnaire?.status !== 'SUBMITTED'
  await prisma.planningQuestionnaire.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      status: 'SUBMITTED',
      responses: parsed.data,
      submittedAt: now,
    },
    update: {
      status: 'SUBMITTED',
      responses: parsed.data,
      // BR-QN03: submittedAt marks the FIRST completion and is not moved by later edits.
      ...(first ? { submittedAt: now } : {}),
    },
  })

  const meta = await requestMeta()
  await logActivity({
    clientId: booking.clientId,
    relatedType: 'Booking',
    relatedId: booking.id,
    actorType: 'CLIENT', // BR-CP06: a client write is logged as the client
    action: first ? 'questionnaire.submitted' : 'questionnaire.updated',
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })

  // BR-F03: the 60 day nudge has served its purpose.
  if (first) {
    await prisma.notification.updateMany({
      where: {
        relatedType: 'Booking',
        relatedId: booking.id,
        templateKey: 'preshoot.questionnaire',
        status: 'QUEUED',
      },
      data: { status: 'CANCELLED', cancelledReason: 'The client submitted the questionnaire' },
    })
  }

  revalidatePath(`/portal/${token}`)
  return { status: 'saved' }
}
