'use server'

import { EnquirySource } from '@prisma/client'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { convertEnquiry, createEnquiry, markEnquiryLost, reopenEnquiry } from '@/lib/domain/enquiry'
import {
  completeWorkItem,
  logClientReply,
  sendStaffReply,
  startQuoting,
} from '@/lib/domain/enquiry-workflow'
import { enquirySchema } from '@/lib/validation/enquiry'

async function requireStaff() {
  const user = await getSessionUser()
  if (!user || !can(user, 'ENQUIRY_CONVERT')) {
    throw new Error('Not authorised.')
  }
  return user
}

async function csrfOk(formData: FormData): Promise<boolean> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  return verifyCsrf(cookieValue, formData.get('csrf'))
}

export async function updateEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const op = String(formData.get('op') ?? '')
  if (!enquiryId) return

  switch (op) {
    case 'lost':
      await markEnquiryLost(enquiryId, 'Not proceeding', user.id)
      break
    case 'reopen':
      await reopenEnquiry(enquiryId, user.id)
      break
    default:
      return
  }
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

export async function completeWorkItemAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const workItemId = String(formData.get('workItemId') ?? '')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!workItemId) return
  await completeWorkItem(workItemId, user.id)
  revalidatePath('/enquiries')
  if (enquiryId) revalidatePath(`/enquiries/${enquiryId}`)
}

export async function sendReplyAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await sendStaffReply(enquiryId, body, user.id)
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

export async function logClientReplyAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await logClientReply(enquiryId, body, user.id)
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

export async function startQuotingAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) return
  await startQuoting(enquiryId, user.id)
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

export async function convertEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const result = await convertEnquiry(enquiryId, user.id)
  revalidatePath('/enquiries')
  redirect(`/projects/${result.projectId}`)
}

export async function markEnquiryLostAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const reason = String(formData.get('reason') ?? '').trim() || 'Not proceeding'
  await markEnquiryLost(enquiryId, reason, user.id)
  revalidatePath('/enquiries')
}

export async function logEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')

  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const parsed = enquirySchema.safeParse({
    name: [firstName, lastName].filter(Boolean).join(' '),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    street: formData.get('street'),
    suburb: formData.get('suburb'),
    state: formData.get('state'),
    postcode: formData.get('postcode'),
    country: formData.get('country'),
    isCompany: formData.get('isCompany') === 'on',
    eventType: formData.get('eventType'),
    message: formData.get('message'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Please check the form.')

  const eventDateRaw = String(formData.get('eventDate') ?? '')
  const eventDate = eventDateRaw ? new Date(eventDateRaw) : null

  const sourceRaw = String(formData.get('source') ?? '').toUpperCase()
  const source = (Object.values(EnquirySource) as string[]).includes(sourceRaw)
    ? (sourceRaw as EnquirySource)
    : EnquirySource.MANUAL

  await createEnquiry(
    {
      name: parsed.data.name,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName ?? null,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      street: parsed.data.street ?? null,
      suburb: parsed.data.suburb ?? null,
      state: parsed.data.state ?? null,
      postcode: parsed.data.postcode ?? null,
      country: parsed.data.country ?? null,
      isCompany: parsed.data.isCompany ?? false,
      eventType: parsed.data.eventType ?? null,
      eventDate,
      message: parsed.data.message ?? null,
      source,
    },
    user.id,
  )
  revalidatePath('/enquiries')
  redirect('/enquiries')
}
