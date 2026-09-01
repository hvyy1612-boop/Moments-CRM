import { z } from 'zod'

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 700 or 700.00.')

export const createInvoiceSchema = z.object({
  type: z.enum(['DEPOSIT', 'BALANCE', 'SUPPLEMENTARY']),
  description: z.string().trim().min(1, 'Describe what this invoice is for.').max(300),
  amount: money,
})

const invoiceLine = z.object({
  description: z.string().trim().min(1, 'Add a description for each item.').max(500),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(999),
  unitPrice: money,
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const instalment = z.object({
  label: z.string().trim().max(100).optional().or(z.literal('')),
  dueAt: isoDate.optional().or(z.literal('')),
  amount: money,
})

export const createInvoiceLinesSchema = z.object({
  type: z.enum(['DEPOSIT', 'BALANCE', 'SUPPLEMENTARY']),
  invoiceDate: isoDate.optional().or(z.literal('')),
  poNumber: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  discount: money.optional().or(z.literal('')),
  lines: z.array(invoiceLine).min(1, 'Add at least one item.').max(50),
  instalments: z.array(instalment).max(12).optional(),
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
export type CreateInvoiceLinesInput = z.infer<typeof createInvoiceLinesSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
