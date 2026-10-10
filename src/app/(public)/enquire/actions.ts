'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { prisma } from '@/lib/db'
import { requestMeta } from '@/lib/http'
import { createEnquiry } from '@/lib/domain/enquiry'
import { enquirySchema } from '@/lib/validation/enquiry'

export type EnquiryFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      message?: string
      errors?: { name?: string; email?: string; phone?: string; message?: string }
    }

const PUBLIC_LIMIT = 5
const PUBLIC_WINDOW_MS = 60 * 60 * 1000

export async function submitEnquiry(
  _prev: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Please refresh and try again.' }
  }

  if (String(formData.get('website') ?? '').trim()) return { status: 'success' }

  const { ipAddress } = await requestMeta()
  const recent = await prisma.auditLog.count({
    where: { action: 'enquiry.public_submitted', createdAt: { gte: new Date(Date.now() - PUBLIC_WINDOW_MS) }, metadata: { path: ['ip'], equals: ipAddress } },
  })
  if (recent >= PUBLIC_LIMIT) {
    return { status: 'error', message: 'We have received several enquiries from you just now. Please try again in an hour, or email us directly.' }
  }

  const parsed = enquirySchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    eventType: formData.get('eventType') ?? '',
    message: formData.get('message') ?? '',
    source: formData.get('source') ?? '',
  })
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    return {
      status: 'error',
      errors: {
        name: fields.name?.[0],
        email: fields.email?.[0],
        phone: fields.phone?.[0],
        message: fields.message?.[0],
      },
    }
  }

  try {

    const enquiry = await createEnquiry(
      {
        name: parsed.data.name,
        firstName: parsed.data.firstName ?? null,
        lastName: parsed.data.lastName ?? null,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        eventType: parsed.data.eventType ?? null,
        message: parsed.data.message ?? null,
        source: 'WEBSITE',
      },
      null,
    )
    await prisma.auditLog.create({
      data: { companyId: enquiry.companyId, action: 'enquiry.public_submitted', entityType: 'Enquiry', entityId: enquiry.id, source: 'public.enquiry', metadata: { ip: ipAddress } },
    })
  } catch {
    return { status: 'error', message: 'Something went wrong saving your enquiry. Please try again.' }
  }
  return { status: 'success' }
}
