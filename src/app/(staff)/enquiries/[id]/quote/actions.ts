'use server'

import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { createQuotation } from '@/lib/domain/quotation'
import { requestMeta } from '@/lib/http'

export type QuoteFormState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'blocked'; blockers: string[] }

const quoteInputSchema = z.object({
  enquiryId: z.string().min(1),
  packageCodes: z.string().max(500),
  addOnCodes: z.string().max(500),
  manualDescription: z.string().trim().max(200).optional(),

  manualAmount: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d*\.?\d{0,2}$/, 'Enter an amount like 250.00')
    .optional(),
})

function codes(value: string): string[] {
  return value
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
}

export async function createQuoteAction(
  _prev: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'That did not work. Reload the page and try again.' }
  }
  const user = await requireRole('/enquiries/[id]/quote')

  const parsed = quoteInputSchema.safeParse({
    enquiryId: formData.get('enquiryId'),
    packageCodes: formData.get('packageCodes') ?? '',
    addOnCodes: formData.get('addOnCodes') ?? '',
    manualDescription: formData.get('manualDescription') ?? undefined,
    manualAmount: formData.get('manualAmount') ?? undefined,
  })
  if (!parsed.success) {
    return { status: 'error', message: 'Check the manual line: the amount must look like 250.00.' }
  }

  const manualLines: { description: string; unitPriceGross: Prisma.Decimal; quantity: number }[] = []
  if (parsed.data.manualDescription && parsed.data.manualAmount) {
    const amount = new Prisma.Decimal(parsed.data.manualAmount)
    if (amount.greaterThan(0)) {
      manualLines.push({
        description: parsed.data.manualDescription,
        unitPriceGross: amount,
        quantity: 1,
      })
    }
  }

  const result = await createQuotation(
    {
      enquiryId: parsed.data.enquiryId,
      packageCodes: codes(parsed.data.packageCodes),
      addOns: codes(parsed.data.addOnCodes).map((code) => ({ code, quantity: 1 })),
      manualLines,
    },
    { userId: user.id },
    await requestMeta(),
  )

  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.reason === 'already_accepted'
          ? 'This enquiry already has an accepted quotation, so a new one cannot be built.'
          : 'That enquiry could not be found.',
    }
  }

  if (result.blockers.length > 0) {
    return { status: 'blocked', blockers: result.blockers }
  }

  redirect(`/quotations/${result.quotationId}`)
}
