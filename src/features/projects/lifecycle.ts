import type { ProjectLifecycle } from '@prisma/client'

/**
 * The job lifecycle (docs/14 section 3): BOOKING_REQUESTED -> CONFIRMED -> COMPLETED -> CLOSED, or
 * CANCELLED. These stages take a job out of the Active list into Jobs > Completed.
 *
 * A JOB is a CONFIRMED booking (the 20% deposit is paid, or it was entered as already confirmed with
 * Add job). Before that the Project row is only the lead's BOOKING FILE: opened when the lead's quote is
 * accepted to hold the deposit invoice and the contract, while the case is still a lead ("Awaiting booking
 * confirmation"). A booking file is never shown or counted as a Job; see JOB_WHERE in lib/domain/project.
 */
export function isBookingFile(p: { lifecycleStatus: ProjectLifecycle | string; confirmedByClientAt: Date | null }): boolean {
  // Cancelled without ever being confirmed = a lead declined before its deposit, not a cancelled job.
  return p.lifecycleStatus === 'BOOKING_REQUESTED' || (p.lifecycleStatus === 'CANCELLED' && p.confirmedByClientAt === null)
}

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
