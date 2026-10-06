import { z } from 'zod'

/**
 * Change Request payloads (docs/25 Rule C2): a fixed, validated set of real change combinations, not an
 * unbounded list of arbitrary edits. Money is a decimal string (D6) and becomes Prisma.Decimal in the
 * domain. Dates are Sydney wall-time strings ("YYYY-MM-DDTHH:mm") parsed with sydneyLocalToUtc.
 */

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 700 or 700.00.')

const fee = z.object({
  amount: money,
  reason: z.string().trim().max(500).optional().nullable(),
})

/** Move the job's shoot to a new date and time; optionally charge a rescheduling fee. */
const reschedule = z.object({
  kind: z.literal('reschedule'),
  newStartsAt: z.string().min(1, 'Choose the new shoot date and time.'),
  fee: fee.optional(),
})

/** Change what is delivered; carries the commercial delta as a fee (a new, higher agreed price). */
const scopeChange = z.object({
  kind: z.literal('scopeChange'),
  summary: z.string().trim().min(1).max(500),
  fee, // required: the price delta the client agrees to
})

/** Reduce the agreed price after an invoice was issued → a credit note against that invoice. */
const priceDecrease = z.object({
  kind: z.literal('priceDecrease'),
  invoiceId: z.string().min(1),
  amount: money,
  reason: z.string().trim().max(500).optional().nullable(),
})

/** A narrow client-data change that affects a commitment (not an ordinary contact edit — Rule C7). */
const clientData = z.object({
  kind: z.literal('clientData'),
  summary: z.string().trim().min(1).max(500),
})

/** A post-production revision request → a tracked revision task with an owner + due date. */
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
