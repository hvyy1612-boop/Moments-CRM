'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { createProjectFromEnquiry } from '@/lib/domain/project'
import { enquirySchema } from '@/lib/validation/enquiry'

export type EnquiryFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      message?: string
      errors?: { name?: string; email?: string; phone?: string; message?: string }
    }

export async function submitEnquiry(
  _prev: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Please refresh and try again.' }
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
    await createProjectFromEnquiry(parsed.data)
  } catch {
    return { status: 'error', message: 'Something went wrong saving your enquiry. Please try again.' }
  }
  return { status: 'success' }
}
