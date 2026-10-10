import type { StatusKind } from '@/components/ui/StatusTag'

export const ENQUIRY_STAGE_LABEL: Record<string, string> = {
  NEW_ENQUIRY: 'New enquiry',
  CONTACTED: 'Contacted',
  CONSULTATION: 'Consultation',
  QUOTE_SENT: 'Quote sent',
  AWAITING_BOOKING_CONFIRMATION: 'Awaiting booking confirmation',
  BOOKING_CONFIRMED: 'Booking confirmed',
  DECLINED: 'Archived', // DB value DECLINED; staff archive a lead that is not going ahead (Studio Ninja)

  JOB_COMPLETE: 'Job complete',
}

export const ENQUIRY_STAGE_KIND: Record<string, StatusKind> = {
  NEW_ENQUIRY: 'enquiry',
  CONTACTED: 'enquiry',
  CONSULTATION: 'quote',
  QUOTE_SENT: 'quote',
  AWAITING_BOOKING_CONFIRMATION: 'booked',
  BOOKING_CONFIRMED: 'delivered',
  DECLINED: 'lost',
  JOB_COMPLETE: 'delivered',
}

export function leadDisplayStatus(status: string, jobCompleteAt: Date | null): string {
  return jobCompleteAt && status !== 'DECLINED' && status !== 'BOOKING_CONFIRMED' ? 'JOB_COMPLETE' : status
}

export const STAGE_ORDER = [
  'NEW_ENQUIRY',
  'CONTACTED',
  'CONSULTATION',
  'QUOTE_SENT',
  'AWAITING_BOOKING_CONFIRMATION',
  'BOOKING_CONFIRMED',
] as const

export const OPEN_STATUSES = new Set(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION', 'QUOTE_SENT', 'AWAITING_BOOKING_CONFIRMATION'])

export function isOpenEnquiry(status: string): boolean {
  return OPEN_STATUSES.has(status)
}

export const STUDIO_TO_ACT = ['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'] as const

export function waitingLabel(status: string): string {
  return (STUDIO_TO_ACT as readonly string[]).includes(status) ? 'You' : 'Client'
}

export const ENQUIRY_STAGE_TABS: { key: string; label: string }[] = [
  { key: 'NEW_ENQUIRY', label: 'New enquiry' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'CONSULTATION', label: 'Consultation' },
  { key: 'QUOTE_SENT', label: 'Quote sent' },
  { key: 'AWAITING_BOOKING_CONFIRMATION', label: 'Awaiting booking confirmation' },

  { key: 'JOB_COMPLETE', label: 'Job complete' },
  { key: 'DECLINED', label: 'Archived' },
]
