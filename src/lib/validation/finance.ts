import { z } from 'zod'

/** Money arrives as a decimal string and becomes Prisma.Decimal in the domain, never a JS number (D6). */
const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 700 or 700.00.')

export const createInvoiceSchema = z.object({
  type: z.enum(['DEPOSIT', 'BALANCE', 'SUPPLEMENTARY']),
  description: z.string().trim().min(1, 'Describe what this invoice is for.').max(300),
  amount: money,
})

export const recordPaymentSchema = z.object({
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']),
  amount: money,
  reference: z
    .string()
    .trim()
    .max(140)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
