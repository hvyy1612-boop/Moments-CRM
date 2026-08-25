import type { StatusKind } from '@/components/ui/StatusTag'

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

export function waitingLabel(waitingOn: string | null): string {
  if (waitingOn === 'STUDIO') return 'You'
  if (waitingOn === 'CLIENT') return 'Client'
  return '-'
}

type ViewMatch = (status: string, waitingOn: string | null) => boolean

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
