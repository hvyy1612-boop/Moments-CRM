import { ProjectLifecycle } from '@prisma/client'
import type { StatusKind } from '@/components/ui/StatusTag'

export const LIFECYCLE_KIND: Record<ProjectLifecycle, StatusKind> = {
  ENQUIRY: 'enquiry',
  QUALIFYING: 'enquiry',
  QUOTING: 'quote',
  AWAITING_DECISION: 'quote',
  NEGOTIATION: 'quote',
  BOOKING_REQUESTED: 'booked',
  CONFIRMED: 'booked',
  IN_PRODUCTION: 'editing',
  COMPLETED: 'delivered',
  CANCELLED: 'lost',
  LOST: 'lost',
  ON_HOLD: 'hold',
  POSTPONED: 'hold',
  ARCHIVED: 'hold',
}

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

export const CLOSED_STATUSES: ReadonlySet<ProjectLifecycle> = new Set([
  'COMPLETED',
  'CANCELLED',
  'LOST',
  'ARCHIVED',
])

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

export function statusLabel(status: string): string {
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

  common: boolean
}

export const LIFECYCLE_OPTIONS: LifecycleOption[] = LIFECYCLE_ORDER.map((value) => ({
  value,
  label: statusLabel(value),
  kind: LIFECYCLE_KIND[value],
  common: COMMON_STATUSES.has(value),
}))

export function isLifecycle(value: string): value is ProjectLifecycle {
  return (Object.values(ProjectLifecycle) as string[]).includes(value)
}
