import { z } from 'zod'

/**
 * BR-E10 requires a reason from a fixed list when an enquiry moves to LOST, but the brief does not
 * publish the list. These values are a labelled PLACEHOLDER pending the studio's own wording
 * (OQ-021); the rule they satisfy is that the reason is chosen from a closed set and validated
 * server-side, never free text. Changing the wording later is a one-line change here plus a
 * migration of stored values.
 */
export const LOST_REASONS = [
  'Date unavailable',
  'Budget',
  'Booked another studio',
  'Event cancelled or postponed',
  'No response from client',
  'Other',
] as const

export type LostReason = (typeof LOST_REASONS)[number]

export const markLostSchema = z.object({
  reason: z.enum(LOST_REASONS, { message: 'Choose a reason from the list.' }), // BR-E10
})

export const assignEnquirySchema = z.object({
  // An empty string clears the assignment; any other value must be a real user id.
  userId: z.string().max(64),
})
