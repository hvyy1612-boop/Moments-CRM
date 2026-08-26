import type { StatusKind } from '@/components/ui/StatusTag'

/**
 * Two separate dimensions, straight from the backend - never invented on the frontend:
 *  - STAGE  = the pipeline `status` enum (where the lead sits): New, Contacted, Qualified, Converted,
 *    Lost, Archived.
 *  - WAITING = the operational `waitingOn` field (who owes the next response): STUDIO or CLIENT.
 * The work queue reads WAITING; the stage is shown as a secondary label.
 */
export const ENQUIRY_STAGE_LABEL: Record<string, string> = {
  NEW: 'New enquiry',
  CONTACTED: 'Discussing details',
  QUALIFIED: 'Preparing quote',
  CONVERTED: 'Booked',
  LOST: 'Not proceeding',
  ARCHIVED: 'Archived',
}

export const ENQUIRY_STAGE_KIND: Record<string, StatusKind> = {
  NEW: 'enquiry',
  CONTACTED: 'quote',
  QUALIFIED: 'booked',
  CONVERTED: 'delivered',
  LOST: 'lost',
  ARCHIVED: 'hold',
}

export const OPEN_STATUSES = new Set(['NEW', 'CONTACTED', 'QUALIFIED'])

export function isOpenEnquiry(status: string): boolean {
  return OPEN_STATUSES.has(status)
}

/** Who owes the next response, in plain words. */
export function waitingLabel(waitingOn: string | null): string {
  if (waitingOn === 'STUDIO') return 'You'
  if (waitingOn === 'CLIENT') return 'Client'
  return '-'
}

type ViewMatch = (status: string, waitingOn: string | null) => boolean

/**
 * The work queue. "Needs attention" and "Waiting for client" are driven by waitingOn (not by status),
 * so a CONTACTED lead can sit in either depending on who replied last. Closed leads never appear in
 * the two active views; they only show under All.
 */
export const ENQUIRY_VIEWS: { key: string; label: string; match: ViewMatch }[] = [
  {
    key: 'attention',
    label: 'Needs attention',
    match: (s, w) => isOpenEnquiry(s) && w === 'STUDIO',
  },
  {
    key: 'waiting',
    label: 'Waiting for client reply',
    match: (s, w) => isOpenEnquiry(s) && w === 'CLIENT',
  },
  { key: 'all', label: 'All', match: () => true },
]

/** Empty-state copy per view, phrased as a status rather than a dead filter. */
export const ENQUIRY_EMPTY: Record<string, { title: string; description: string }> = {
  attention: {
    title: "You're all caught up",
    description: 'No enquiries are waiting for your reply right now.',
  },
  waiting: {
    title: 'Nothing waiting on a client',
    description: 'No enquiries are currently with a client for their response.',
  },
  all: {
    title: 'No enquiries yet',
    description: 'Log a new lead using the Log enquiry button above, or wait for one from the website.',
  },
}
