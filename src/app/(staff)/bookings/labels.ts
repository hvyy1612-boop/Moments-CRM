import type { Tone } from '@/components/ui/StatusPill'

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
