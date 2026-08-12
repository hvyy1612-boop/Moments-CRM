'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import {
  assignEnquiry,
  changeLostReason,
  markContacted,
  markLost,
  reopenEnquiry,
} from '@/lib/domain/enquiry-workflow'
import { requestMeta } from '@/lib/http'
import { assignEnquirySchema, markLostSchema } from '@/lib/validation/enquiry-workflow'

export type EnquiryActionState = { status: 'idle' } | { status: 'error'; message: string }

const GENERIC_ERROR = 'That did not work. Reload the page and try again.'

/** Every action here re-checks the role server-side (SEC-A01) and the CSRF token (SEC-A04). */
async function authorise(formData: FormData) {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return null
  const user = await requireRole('/enquiries/[id]')
  return user
}

function enquiryIdFrom(formData: FormData): string | null {
  const value = formData.get('enquiryId')
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function contactEnquiry(
  _prev: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const user = await authorise(formData)
  const enquiryId = enquiryIdFrom(formData)
  if (!user || !enquiryId) return { status: 'error', message: GENERIC_ERROR }

  const result = await markContacted(enquiryId, { userId: user.id }, await requestMeta())
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.reason === 'wrong_status'
          ? 'This enquiry has already moved on from new.'
          : GENERIC_ERROR,
    }
  }
  revalidatePath(`/enquiries/${enquiryId}`)
  revalidatePath('/enquiries')
  return { status: 'idle' }
}

export async function loseEnquiry(
  _prev: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const user = await authorise(formData)
  const enquiryId = enquiryIdFrom(formData)
  if (!user || !enquiryId) return { status: 'error', message: GENERIC_ERROR }

  // BR-E10: the reason must come from the fixed list, checked on the server (SEC-A02).
  const parsed = markLostSchema.safeParse({ reason: formData.get('reason') })
  if (!parsed.success) {
    return { status: 'error', message: 'Choose a reason from the list.' }
  }

  const result = await markLost(enquiryId, parsed.data.reason, { userId: user.id }, await requestMeta())
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.reason === 'wrong_status'
          ? 'This enquiry is already closed.'
          : GENERIC_ERROR,
    }
  }
  revalidatePath(`/enquiries/${enquiryId}`)
  revalidatePath('/enquiries')
  return { status: 'idle' }
}

/** Undo a mistaken LOST. The enquiry returns to the working list; the log keeps both entries. */
export async function reopenLostEnquiry(
  _prev: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const user = await authorise(formData)
  const enquiryId = enquiryIdFrom(formData)
  if (!user || !enquiryId) return { status: 'error', message: GENERIC_ERROR }

  const result = await reopenEnquiry(enquiryId, { userId: user.id }, await requestMeta())
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.reason === 'wrong_status'
          ? 'This enquiry is not marked as lost, so there is nothing to reopen.'
          : GENERIC_ERROR,
    }
  }
  revalidatePath(`/enquiries/${enquiryId}`)
  revalidatePath('/enquiries')
  return { status: 'idle' }
}

/** Correct the reason on an enquiry that is already lost (BR-E10 list still applies). */
export async function updateLostReason(
  _prev: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const user = await authorise(formData)
  const enquiryId = enquiryIdFrom(formData)
  if (!user || !enquiryId) return { status: 'error', message: GENERIC_ERROR }

  const parsed = markLostSchema.safeParse({ reason: formData.get('reason') })
  if (!parsed.success) return { status: 'error', message: 'Choose a reason from the list.' }

  const result = await changeLostReason(
    enquiryId,
    parsed.data.reason,
    { userId: user.id },
    await requestMeta(),
  )
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.reason === 'wrong_status'
          ? 'This enquiry is not marked as lost.'
          : GENERIC_ERROR,
    }
  }
  revalidatePath(`/enquiries/${enquiryId}`)
  revalidatePath('/enquiries')
  return { status: 'idle' }
}

export async function setEnquiryAssignee(
  _prev: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const user = await authorise(formData)
  const enquiryId = enquiryIdFrom(formData)
  if (!user || !enquiryId) return { status: 'error', message: GENERIC_ERROR }

  const parsed = assignEnquirySchema.safeParse({ userId: formData.get('userId') ?? '' })
  if (!parsed.success) return { status: 'error', message: GENERIC_ERROR }

  const result = await assignEnquiry(
    enquiryId,
    parsed.data.userId === '' ? null : parsed.data.userId,
    { userId: user.id },
    await requestMeta(),
  )
  if (!result.ok) return { status: 'error', message: GENERIC_ERROR }
  revalidatePath(`/enquiries/${enquiryId}`)
  revalidatePath('/enquiries')
  return { status: 'idle' }
}
