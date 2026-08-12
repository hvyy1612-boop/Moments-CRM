'use server'

import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { assignCrew, recordPayment, setDeliverableStatus, type CrewSlot } from '@/lib/domain/booking'
import { requestMeta } from '@/lib/http'

export type BookingActionState = { status: 'idle' } | { status: 'error'; message: string }

const GENERIC = 'That did not work. Reload the page and try again.'

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  // Money arrives as text and becomes a Decimal here. Never a JavaScript number (D6, BR-P03).
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 1570.00'),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER']),
  reference: z.string().trim().max(120).optional(),
})

export async function recordPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: GENERIC }
  }
  const user = await requireRole('/bookings/[id]') // SEC-A01

  const parsed = paymentSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    amount: formData.get('amount'),
    method: formData.get('method'),
    reference: formData.get('reference') ?? undefined,
  })
  if (!parsed.success) {
    return { status: 'error', message: 'Enter an amount like 1570.00 and choose how it was paid.' }
  }

  const result = await recordPayment(
    {
      invoiceId: parsed.data.invoiceId,
      amountGross: new Prisma.Decimal(parsed.data.amount),
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      provider: 'MANUAL',
    },
    { userId: user.id },
    await requestMeta(),
  )

  if (!result.ok) {
    const message =
      result.reason === 'exceeds_balance'
        ? 'That is more than the invoice has outstanding. A payment can never exceed the balance.'
        : result.reason === 'void'
          ? 'That invoice has been voided.'
          : result.reason === 'not_positive'
            ? 'Enter an amount greater than zero.'
            : GENERIC
    return { status: 'error', message }
  }

  revalidatePath('/bookings')
  revalidatePath('/dashboard')
  return { status: 'idle' }
}

const SLOTS: CrewSlot[] = ['leadPhotographerId', 'leadVideographerId', 'secondShooterId']

const crewSchema = z.object({
  bookingId: z.string().min(1),
  leadPhotographerId: z.string().max(64),
  leadVideographerId: z.string().max(64),
  secondShooterId: z.string().max(64),
})

/**
 * Save all three crew slots. Each is applied separately so the database trigger (BR-B05) can
 * refuse one clash without discarding the other two choices.
 */
export async function assignCrewAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: GENERIC }
  }
  const user = await requireRole('/bookings/[id]') // SEC-A01

  const parsed = crewSchema.safeParse({
    bookingId: formData.get('bookingId'),
    leadPhotographerId: formData.get('leadPhotographerId') ?? '',
    leadVideographerId: formData.get('leadVideographerId') ?? '',
    secondShooterId: formData.get('secondShooterId') ?? '',
  })
  if (!parsed.success) return { status: 'error', message: GENERIC }

  const meta = await requestMeta()
  for (const slot of SLOTS) {
    const value = parsed.data[slot]
    const result = await assignCrew(
      { bookingId: parsed.data.bookingId, slot, crewMemberId: value === '' ? null : value },
      { userId: user.id },
      meta,
    )
    if (!result.ok) {
      const message =
        result.reason === 'double_booked'
          ? 'That crew member already holds a confirmed booking on this date, so they cannot take this one as well.'
          : result.reason === 'inactive'
            ? 'That crew member is no longer active.'
            : GENERIC
      return { status: 'error', message }
    }
  }

  revalidatePath('/bookings')
  return { status: 'idle' }
}

const deliverableSchema = z.object({
  deliverableId: z.string().min(1),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DELIVERED', 'CLOSED']),
  galleryUrl: z.string().trim().max(500).optional(),
})

export async function setDeliverableAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: GENERIC }
  }
  const user = await requireRole('/bookings/[id]') // SEC-A01

  const parsed = deliverableSchema.safeParse({
    deliverableId: formData.get('deliverableId'),
    status: formData.get('status'),
    galleryUrl: formData.get('galleryUrl') ?? undefined,
  })
  if (!parsed.success) return { status: 'error', message: GENERIC }

  const result = await setDeliverableStatus(
    {
      deliverableId: parsed.data.deliverableId,
      status: parsed.data.status,
      galleryUrl: parsed.data.galleryUrl ?? null,
    },
    { userId: user.id },
    await requestMeta(),
  )

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.reason === 'needs_gallery_url'
          ? 'Add the gallery link before marking this delivered. Delivered with nothing to open is not a delivery.'
          : GENERIC,
    }
  }

  revalidatePath('/bookings')
  revalidatePath('/dashboard')
  return { status: 'idle' }
}
