import { z } from 'zod'

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 700 or 700.00.')

export const createInvoiceSchema = z.object({
  type: z.enum(['DEPOSIT', 'BALANCE', 'SUPPLEMENTARY']),
  description: z.string().trim().min(1, 'Please describe what this invoice is for.').max(300),
  amount: money,
})

const invoiceLine = z.object({
  itemName: z.string().trim().min(1, 'Please add a name for each item.').max(200),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(999),
  unitPrice: money,
  discount: money.optional().or(z.literal('')),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const instalment = z.object({
  label: z.string().trim().max(100).optional().or(z.literal('')),
  dueAt: isoDate.optional().or(z.literal('')),
  amount: money,
})

export const createInvoiceLinesSchema = z.object({
  type: z.enum(['DEPOSIT', 'BALANCE', 'SUPPLEMENTARY']),
  invoiceNumber: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9\-/]+$/, 'Use letters, numbers, - or /.')
    .optional()
    .or(z.literal('')),
  invoiceDate: isoDate.optional().or(z.literal('')),
  poNumber: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  discount: money.optional().or(z.literal('')),
  discountReason: z.string().trim().max(100).optional().or(z.literal('')),
  lines: z.array(invoiceLine).min(1, 'Please add at least one item.').max(50),
  instalments: z.array(instalment).max(12).optional(),

  billingName: z.string().trim().max(150).optional().or(z.literal('')),
  billingEmail: z.string().trim().max(255).optional().or(z.literal('')),
  billingPhone: z.string().trim().max(40).optional().or(z.literal('')),
  jobName: z.string().trim().max(150).optional().or(z.literal('')),
  due: z.enum(['ON_ISSUE', 'NET7', 'NET14']).optional(),
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
