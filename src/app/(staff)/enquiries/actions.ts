'use server'

import { EnquirySource } from '@prisma/client'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { convertEnquiry, createEnquiry, markEnquiryLost } from '@/lib/domain/enquiry'
import { enquirySchema } from '@/lib/validation/enquiry'

async function requireStaff() {
  const user = await getSessionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) {
    throw new Error('Not authorised.')
  }
  return user
}

async function csrfOk(formData: FormData): Promise<boolean> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  return verifyCsrf(cookieValue, formData.get('csrf'))
}

/** Convert an enquiry into a client + project, then open the new project. */
export async function convertEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const result = await convertEnquiry(enquiryId, user.id)
  revalidatePath('/enquiries')
  redirect(`/projects/${result.projectId}`)
}

/** Mark an enquiry as lost. */
export async function markEnquiryLostAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const reason = String(formData.get('reason') ?? '').trim() || 'Not proceeding'
  await markEnquiryLost(enquiryId, reason, user.id)
  revalidatePath('/enquiries')
}

/** Log a new enquiry from the staff form. */
export async function logEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')

  const parsed = enquirySchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
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
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
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
