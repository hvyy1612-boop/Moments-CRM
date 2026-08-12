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

  if (!booking || booking.status === 'CANCELLED') {
    return { status: 'error', message: 'That link is not valid. Reload the page and try again.' }
  }

  const now = systemClock.now()

  if (now.getTime() > booking.shootDate.getTime()) {
    return {
      status: 'error',
      message: 'The shoot has already happened, so these answers can no longer be changed.',
    }
  }

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
