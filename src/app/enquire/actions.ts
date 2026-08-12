'use server'

import { headers } from 'next/headers'
import { createEnquiry } from '@/lib/domain/enquiry'
import { enquiryInputSchema } from '@/lib/validation/enquiry'
import { correlationId, logger } from '@/lib/logger'

export type EnquiryFormState =
  | { status: 'idle' }
  | { status: 'error'; errors: Record<string, string>; message?: string }
  | { status: 'success'; merged: boolean; farFutureWarning: boolean }

function text(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export async function submitEnquiry(
  _previous: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  // Validate every field on the server, even ones the browser already checked (SEC-A02).
  const parsed = enquiryInputSchema.safeParse({
    primaryName: text(formData.get('primaryName')),
    partnerName: text(formData.get('partnerName')),
    email: text(formData.get('email')),
    phone: text(formData.get('phone')),
    enquiryType: text(formData.get('enquiryType')),
    eventDate: text(formData.get('eventDate')),
    venueName: text(formData.get('venueName')),
    message: text(formData.get('message')),
    packageCodes: formData.getAll('packageCodes').map(String).filter(Boolean),
    marketingConsent: formData.get('marketingConsent') === 'on',
  })

  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && errors[key] === undefined) {
        errors[key] = issue.message
      }
    }
    return { status: 'error', errors }
  }

  try {
    const requestHeaders = await headers()
    const forwarded = requestHeaders.get('x-forwarded-for')
    const ipAddress = forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : null
    const result = await createEnquiry(parsed.data, { ipAddress })
    return { status: 'success', merged: result.merged, farFutureWarning: result.farFutureWarning }
  } catch (error) {
    // Log server-side with a correlation id; never leak internals to the couple (SEC-A07, §17.3).
    logger.error('enquiry.submit failed', {
      correlationId: correlationId(),
      cause: error instanceof Error ? error.message : String(error),
    })
    return { status: 'error', errors: {}, message: 'Something went wrong. Please try again.' }
  }
}
