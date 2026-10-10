import { z } from 'zod'

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 700 or 700.00.')

const fee = z.object({
  amount: money,
  reason: z.string().trim().max(500).optional().nullable(),
})

const reschedule = z.object({
  kind: z.literal('reschedule'),
  newStartsAt: z.string().min(1, 'Choose the new shoot date and time.'),
  fee: fee.optional(),
})

const scopeChange = z.object({
  kind: z.literal('scopeChange'),
  summary: z.string().trim().min(1).max(500),
  fee, // required: the price delta the client agrees to
})

const priceDecrease = z.object({
  kind: z.literal('priceDecrease'),
  invoiceId: z.string().min(1),
  amount: money,
  reason: z.string().trim().max(500).optional().nullable(),
})

const clientData = z.object({
  kind: z.literal('clientData'),
  summary: z.string().trim().min(1).max(500),
})

const production = z.object({
  kind: z.literal('production'),
  summary: z.string().trim().min(1).max(500),
  dueAt: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
})

export const changeRequestPayloadSchema = z.discriminatedUnion('kind', [
  reschedule,
  scopeChange,
  priceDecrease,
  clientData,
  production,
])

export type ChangeRequestPayload = z.infer<typeof changeRequestPayloadSchema>
export type ReschedulePayload = z.infer<typeof reschedule>
export type ScopeChangePayload = z.infer<typeof scopeChange>
export type PriceDecreasePayload = z.infer<typeof priceDecrease>
export type ProductionPayload = z.infer<typeof production>
