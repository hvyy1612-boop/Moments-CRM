'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { queueNotification } from '@/lib/domain/notification'
import { sendQuotation } from '@/lib/domain/quotation'
import { env } from '@/lib/env'
import { requestMeta } from '@/lib/http'

export type SendState = { status: 'idle' } | { status: 'error'; message: string }

export async function sendQuotationAction(_prev: SendState, formData: FormData): Promise<SendState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'That did not work. Reload the page and try again.' }
  }
  const user = await requireRole('/quotations/[id]')

  const quotationId = formData.get('quotationId')
  if (typeof quotationId !== 'string' || !quotationId) {
    return { status: 'error', message: 'That quotation could not be found.' }
  }

  const result = await sendQuotation(quotationId, { userId: user.id }, await requestMeta())
  if (!result.ok) {
    const message =
      result.reason === 'manual_pricing'
        ? 'Add a travel line before sending: the venue is beyond the included radius.'
        : result.reason === 'empty'
          ? 'Add at least one item before sending.'
          : result.reason === 'not_draft'
            ? 'This quotation has already been sent. Create a new version to change it.'
            : 'That quotation could not be found.'
    return { status: 'error', message }
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      validUntil: true,
      totalGross: true,
      enquiry: {
        select: { clientId: true, client: { select: { email: true, primaryName: true } } },
      },
    },
  })
  if (quotation) {
    await queueNotification({
      clientId: quotation.enquiry.clientId,
      channel: 'EMAIL',
      templateKey: 'quotation.sent',
      recipient: quotation.enquiry.client.email,
      subject: 'Your quotation from Moments Photography and Film',
      bodyText: [
        `Hello ${quotation.enquiry.client.primaryName},`,
        '',
        'Your quotation is ready. Open the link below to read it and let the studio know either way.',
        '',
        `${env.NEXT_PUBLIC_APP_URL}/quote/${result.viewToken}`,
        '',
        'The quotation holds for 14 days. If anything looks wrong, reply to this email and the studio will sort it out.',
      ].join('\n'),
      relatedType: 'Quotation',
      relatedId: quotationId,
    })
  }

  revalidatePath(`/quotations/${quotationId}`)
  return { status: 'idle' }
}
