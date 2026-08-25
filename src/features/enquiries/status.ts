import type { StatusKind } from '@/components/ui/StatusTag'

export const ENQUIRY_KIND: Record<string, StatusKind> = {
  NEW: 'enquiry',
  CONTACTED: 'quote',
  QUALIFIED: 'booked',
  CONVERTED: 'delivered',
  LOST: 'lost',
  ARCHIVED: 'hold',
}

export const ENQUIRY_LABEL: Record<string, string> = {
  NEW: 'New enquiry',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Quoting',
  CONVERTED: 'Booked',
  LOST: 'Lost',
  ARCHIVED: 'Archived',
}

export const ENQUIRY_NEXT_STEP: Record<string, string> = {
  NEW: 'Send first reply',
  CONTACTED: 'Follow up',
  QUALIFIED: 'Send a quote, then book',
  CONVERTED: 'Open the project',
  LOST: '-',
  ARCHIVED: '-',
}

export const OPEN_STATUSES = new Set(['NEW', 'CONTACTED', 'QUALIFIED'])

type Option = { value: string; label: string; kind: StatusKind }

export const STAGE_OPTIONS: Option[] = [
  { value: 'NEW', label: 'New enquiry', kind: 'enquiry' },
  { value: 'CONTACTED', label: 'Contacted', kind: 'quote' },
  { value: 'QUALIFIED', label: 'Quoting', kind: 'booked' },
]

export const OUTCOME_OPTIONS: Option[] = [
  { value: 'CONVERTED', label: 'Booked · create project', kind: 'delivered' },
  { value: 'LOST', label: 'Lost', kind: 'lost' },
]
