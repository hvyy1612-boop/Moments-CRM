import type { ProjectLifecycle } from '@prisma/client'

/**
 * The job lifecycle (docs/14 section 3): BOOKING_REQUESTED (provisional, awaiting the deposit) ->
 * CONFIRMED -> COMPLETED -> CLOSED, or CANCELLED. These stages take a job out of the Active list into
 * Jobs > Completed.
 */
export const CLOSED_STATUSES: ReadonlySet<ProjectLifecycle> = new Set<ProjectLifecycle>(['COMPLETED', 'CLOSED', 'CANCELLED'])

// COMPLETED reads as "Delivered" (every task done and paid); CLOSED is the later staff close.
const LIFECYCLE_DISPLAY: Partial<Record<ProjectLifecycle, string>> = { COMPLETED: 'Delivered' }

/** BOOKING_REQUESTED -> "Booking Requested", COMPLETED -> "Delivered". */
export function statusLabel(status: string): string {
  const override = LIFECYCLE_DISPLAY[status as ProjectLifecycle]
  if (override) return override
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
