import { z } from 'zod'

/**
 * Quote builder + client acceptance. Money arrives as a decimal string and becomes Prisma.Decimal in
 * the domain layer, never a JS number (BR-P03, D6).
 */
export const quoteLineSchema = z.object({
  description: z.string().trim().min(1, 'Please describe this line.').max(300),
  quantity: z.coerce.number().int('Whole numbers only.').min(1).max(999),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 3500 or 3500.00.'),
  // What the line is: a catalogue package, an add-on product, or a free-typed custom line. Presentation
  // only (groups the line under Packages vs Add-ons); does not change the maths.
  lineType: z.enum(['custom', 'package', 'addon']).optional(),
  referenceId: z.string().trim().max(30).optional().nullable(),
  // Immutable snapshot of a package's inclusions at quote time (one item per line). Presentation only.
  details: z.string().trim().max(4000).optional().nullable(),
  // A per-line discount, already resolved to a DOLLAR amount off (the builder converts %/$ before saving).
  // Optional so older payloads (and callers that never discount) still parse; computeTotals treats a
  // missing discount as 0.
  discount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter a discount like 0 or 50.00.').optional(),
})

export const saveQuoteSchema = z.object({
  lines: z.array(quoteLineSchema).min(1, 'Please add at least one line.').max(50),
  // Required (Studio-Ninja parity): a Quote ID and an Issue Date must be entered before saving.
  reference: z.string({ invalid_type_error: 'Please enter a quote ID.' }).trim().min(1, 'Please enter a quote ID.').max(60),
  issueDate: z.string({ invalid_type_error: 'Please enter the issue date.' }).trim().min(1, 'Please enter the issue date.'),
  validUntil: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  poNumber: z.string().trim().max(60).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  notes: z.string().trim().max(2000).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  depositPercent: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? Math.min(100, Math.max(0, Math.round(Number(v)) || 0)) : null)),
})

export const acceptQuoteSchema = z.object({
  acceptedName: z.string().trim().min(1, 'Please type your name to accept.').max(120),
})

export type QuoteLineInput = z.infer<typeof quoteLineSchema>
export type SaveQuoteInput = z.infer<typeof saveQuoteSchema>
