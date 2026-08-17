import { z } from 'zod'

export const quoteLineSchema = z.object({
  description: z.string().trim().min(1, 'Describe this line.').max(300),
  quantity: z.coerce.number().int('Whole numbers only.').min(1).max(999),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 3500 or 3500.00.'),
})

export const saveQuoteSchema = z.object({
  lines: z.array(quoteLineSchema).min(1, 'Add at least one line.').max(50),
  validUntil: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
})

export const acceptQuoteSchema = z.object({
  acceptedName: z.string().trim().min(1, 'Type your name to accept.').max(120),
})

export type QuoteLineInput = z.infer<typeof quoteLineSchema>
export type SaveQuoteInput = z.infer<typeof saveQuoteSchema>
