import type { Tone } from '@/components/ui/StatusPill'

/**
 * Shared wording and tones for booking screens, so the list and the detail never disagree.
 *
 * These live here rather than in page.tsx because Next.js only permits its own known exports from
 * a page file: anything else fails the production build, which is where this was caught.
 */
export const BOOKING_TONE: Record<string, Tone> = {
  PENDING_BOOKING_FEE: 'warn',
  CONFIRMED: 'good',
  DELIVERED: 'info',
  CLOSED: 'neutral',
  CANCELLED: 'bad',
}

export const BOOKING_LABEL: Record<string, string> = {
  PENDING_BOOKING_FEE: 'Awaiting booking fee',
  CONFIRMED: 'Confirmed',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}
