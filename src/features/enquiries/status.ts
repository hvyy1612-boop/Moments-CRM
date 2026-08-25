import type { StatusKind } from '@/components/ui/StatusTag'

/**
 * Enquiry status, in plain wording a first-time reader understands (Studio Ninja style: a lead is
 * worked, then Booked as a project or marked Lost). The database keeps the original enum; these maps
 * only decide what shows on screen and which options the inline picker offers.
 */
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

/** What to do next at each stage, so a row reads as an instruction. */
export const ENQUIRY_NEXT_STEP: Record<string, string> = {
  NEW: 'Send first reply',
  CONTACTED: 'Follow up',
  QUALIFIED: 'Send a quote, then book',
  CONVERTED: 'Open the project',
  LOST: '-',
  ARCHIVED: '-',
}

/** Stages where the lead is still being worked. Only these show the interactive picker. */
export const OPEN_STATUSES = new Set(['NEW', 'CONTACTED', 'QUALIFIED'])

type Option = { value: string; label: string; kind: StatusKind }

/** Pipeline stages the picker sets directly (a plain status change). */
export const STAGE_OPTIONS: Option[] = [
  { value: 'NEW', label: 'New enquiry', kind: 'enquiry' },
  { value: 'CONTACTED', label: 'Contacted', kind: 'quote' },
  { value: 'QUALIFIED', label: 'Quoting', kind: 'booked' },
]

/** Outcomes the picker triggers as an action: Booked creates a project, Lost closes the lead. */
export const OUTCOME_OPTIONS: Option[] = [
  { value: 'CONVERTED', label: 'Booked · create project', kind: 'delivered' },
  { value: 'LOST', label: 'Lost', kind: 'lost' },
]
