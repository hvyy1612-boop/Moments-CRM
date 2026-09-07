import type { StatusKind } from '@/components/ui/StatusTag'

export const ENQUIRY_STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'In discussion',
  QUALIFIED: 'Quoting',
  CONVERTED: 'Booked',
  LOST: 'Lost',
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

  { key: 'all', label: 'All', match: (s) => isOpenEnquiry(s) || s === 'CONVERTED' },
  {
    key: 'attention',
    label: 'Needs your reply',
    match: (s, w) => isOpenEnquiry(s) && w === 'STUDIO',
  },
  {
    key: 'waiting',
    label: 'Waiting on client reply',
    match: (s, w) => isOpenEnquiry(s) && w === 'CLIENT',
  },

  { key: 'booked', label: 'Booked', match: (s) => s === 'CONVERTED' },
  { key: 'archived', label: 'Lost or archived', match: (s) => s === 'LOST' || s === 'ARCHIVED' },
]

export const ENQUIRY_EMPTY: Record<string, { title: string; description: string }> = {
  all: {
    title: 'No enquiries yet',
    description: 'New leads from the website or "Add client" appear here. Booked ones stay as a record and also open as a Job.',
  },
  attention: {
    title: "You're all caught up",
    description: 'No open enquiries are waiting for your reply right now.',
  },
  waiting: {
    title: 'Nothing waiting on a client',
    description: 'No open enquiries are currently with a client for their response.',
  },
  booked: {
    title: 'No booked enquiries yet',
    description: 'When an enquiry is booked it becomes a Job and stays here as a record.',
  },
  archived: {
    title: 'Nothing here',
    description: 'Leads you mark as lost or archived show up here.',
  },
}
