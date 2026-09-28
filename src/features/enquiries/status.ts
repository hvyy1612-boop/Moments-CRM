import type { StatusKind } from '@/components/ui/StatusTag'

/**
 * The Enquiry SALES lifecycle - the single high-level business state of a lead, straight from the
 * backend `status` enum (never invented on the frontend). Backend actions drive the transitions
 * (send quote, accept quote, record deposit, decline); staff do not free-jump between stages.
 *
 *   New enquiry -> Contacted -> Consultation -> Quote sent
 *     -> Awaiting booking confirmation -> Booking confirmed
 *   (Declined = closed before a booking was confirmed)
 *
 * Staff-facing labels are intentional and must read as business meaning, not technical codes.
 */
export const ENQUIRY_STAGE_LABEL: Record<string, string> = {
  NEW_ENQUIRY: 'New enquiry',
  CONTACTED: 'Contacted',
  CONSULTATION: 'Consultation',
  QUOTE_SENT: 'Quote sent',
  AWAITING_BOOKING_CONFIRMATION: 'Awaiting booking confirmation',
  BOOKING_CONFIRMED: 'Booking confirmed',
  DECLINED: 'Declined',
}

/** Restrained status-pill tone per stage (no rainbow): progress reads through the neutral kinds. */
export const ENQUIRY_STAGE_KIND: Record<string, StatusKind> = {
  NEW_ENQUIRY: 'enquiry',
  CONTACTED: 'enquiry',
  CONSULTATION: 'quote',
  QUOTE_SENT: 'quote',
  AWAITING_BOOKING_CONFIRMATION: 'booked',
  BOOKING_CONFIRMED: 'delivered',
  DECLINED: 'lost',
}

/** Stage order for progression checks (excludes the DECLINED terminal branch). */
export const STAGE_ORDER = [
  'NEW_ENQUIRY',
  'CONTACTED',
  'CONSULTATION',
  'QUOTE_SENT',
  'AWAITING_BOOKING_CONFIRMATION',
  'BOOKING_CONFIRMED',
] as const

/** Live leads still in the pipeline (everything before the booking is confirmed, and not declined). */
export const OPEN_STATUSES = new Set(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION', 'QUOTE_SENT', 'AWAITING_BOOKING_CONFIRMATION'])

export function isOpenEnquiry(status: string): boolean {
  return OPEN_STATUSES.has(status)
}

/**
 * Who owes the next response, in plain words. `waitingOn` is NOT a lifecycle stage (spec §8) - it is off
 * the Enquiries list, but still supports the conversation state on the detail page.
 */
export function waitingLabel(waitingOn: string | null): string {
  if (waitingOn === 'STUDIO') return 'You'
  if (waitingOn === 'CLIENT') return 'Client'
  return '-'
}

/**
 * List filter tabs (spec §11): All + one tab per stage. Counts come from real data in the list, not
 * hard-coded. Order follows the lifecycle so the pipeline reads left-to-right.
 */
export const ENQUIRY_STAGE_TABS: { key: string; label: string }[] = [
  { key: 'NEW_ENQUIRY', label: 'New enquiry' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'CONSULTATION', label: 'Consultation' },
  { key: 'QUOTE_SENT', label: 'Quote sent' },
  { key: 'AWAITING_BOOKING_CONFIRMATION', label: 'Awaiting booking confirmation' },
  { key: 'BOOKING_CONFIRMED', label: 'Booking confirmed' },
  { key: 'DECLINED', label: 'Declined' },
]
