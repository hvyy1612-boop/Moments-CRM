import { ProjectLifecycle } from '@prisma/client'
import type { StatusKind } from '@/components/ui/StatusTag'

/**
 * Single source of truth for the project lifecycle: the order it reads in on the board, the status
 * colour (StatusKind) each stage maps to, and which stages count as "closed". The Projects board and
 * the inline status picker both import from here so a label only ever gets defined once.
 */
export const LIFECYCLE_KIND: Record<ProjectLifecycle, StatusKind> = {
  ENQUIRY: 'enquiry',
  QUALIFYING: 'enquiry',
  QUOTING: 'quote',
  AWAITING_DECISION: 'hold',
  NEGOTIATION: 'quote',
  BOOKING_REQUESTED: 'booked',
  CONFIRMED: 'booked',
  IN_PRODUCTION: 'editing',
  COMPLETED: 'delivered',
  CLOSED: 'delivered',
  CANCELLED: 'lost',
  LOST: 'lost',
  ON_HOLD: 'hold',
  POSTPONED: 'hold',
  ARCHIVED: 'hold',
}

/** Pipeline reading order, open stages first then the closed/parked ones. Drives the picker menu. */
export const LIFECYCLE_ORDER: readonly ProjectLifecycle[] = [
  'ENQUIRY',
  'QUALIFYING',
  'QUOTING',
  'AWAITING_DECISION',
  'NEGOTIATION',
  'BOOKING_REQUESTED',
  'CONFIRMED',
  'IN_PRODUCTION',
  'COMPLETED',
  'ON_HOLD',
  'POSTPONED',
  'CANCELLED',
  'LOST',
  'ARCHIVED',
]

/** Stages that move a project out of the open pipeline into its own board group. */
export const CLOSED_STATUSES: ReadonlySet<ProjectLifecycle> = new Set([
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
  'LOST',
  'ARCHIVED',
])

/**
 * The "committed" milestone (Studio-Ninja "Job accepted"): a case becomes a booked Job the moment a
 * quote is ACCEPTED, a contract is signed (=> CONFIRMED), a payment is taken (=> DEPOSIT_PAID / PAID),
 * or staff confirm - NOT a manual "book" step and NOT a funnel status. It is DERIVED from the commercial
 * + lifecycle facts, so the phase always reflects reality. committed == false => Sales phase
 * (Enquiries); committed == true => Production phase (Jobs). (docs/24)
 */
export const COMMITTED_LIFECYCLE = ['CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'CLOSED'] as const
export const COMMITTED_COMMERCIAL = ['ACCEPTED', 'DEPOSIT_PAID', 'PAID'] as const
const COMMITTED_LC = new Set<string>(COMMITTED_LIFECYCLE)
const COMMITTED_CM = new Set<string>(COMMITTED_COMMERCIAL)

export function isCommitted(p: { lifecycleStatus: string; commercialStatus: string }): boolean {
  return COMMITTED_LC.has(p.lifecycleStatus) || COMMITTED_CM.has(p.commercialStatus)
}

/**
 * The everyday stages a studio moves work through: the main funnel plus the "lost" outcome. The
 * picker shows these first; the rest (sub-states and edge cases) sit behind a "More" toggle so the
 * menu stays short, the way a Monday status column shows a curated label set.
 */
export const COMMON_STATUSES: ReadonlySet<ProjectLifecycle> = new Set([
  'ENQUIRY',
  'QUOTING',
  'AWAITING_DECISION',
  'CONFIRMED',
  'IN_PRODUCTION',
  'COMPLETED',
  'LOST',
])

export function statusKind(status: string): StatusKind {
  return LIFECYCLE_KIND[status as ProjectLifecycle] ?? 'hold'
}

// A few lifecycle values read better with a bespoke name than a title-cased enum: COMPLETED means the
// work has been delivered to the client (CLOSED is the later "delivered and settled" terminal).
const LIFECYCLE_DISPLAY: Partial<Record<ProjectLifecycle, string>> = { COMPLETED: 'Delivered' }

/** ENQUIRY -> "Enquiry", AWAITING_DECISION -> "Awaiting Decision", COMPLETED -> "Delivered". */
export function statusLabel(status: string): string {
  const override = LIFECYCLE_DISPLAY[status as ProjectLifecycle]
  if (override) return override
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export type LifecycleOption = {
  value: ProjectLifecycle
  label: string
  kind: StatusKind
  /** Shown up front in the picker; the rest are tucked behind the "More" toggle. */
  common: boolean
}

/** The full option list the picker renders, in reading order, each with its label and colour. */
export const LIFECYCLE_OPTIONS: LifecycleOption[] = LIFECYCLE_ORDER.map((value) => ({
  value,
  label: statusLabel(value),
  kind: LIFECYCLE_KIND[value],
  common: COMMON_STATUSES.has(value),
}))

/** Narrow an untrusted string (a form value) to a real lifecycle status. */
export function isLifecycle(value: string): value is ProjectLifecycle {
  return (Object.values(ProjectLifecycle) as string[]).includes(value)
}
