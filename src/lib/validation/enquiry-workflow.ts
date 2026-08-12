import { z } from 'zod'

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

  userId: z.string().max(64),
})
