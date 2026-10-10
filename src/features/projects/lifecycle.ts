import type { ProjectLifecycle } from '@prisma/client'

export function isBookingFile(p: { lifecycleStatus: ProjectLifecycle | string; confirmedByClientAt: Date | null }): boolean {

  return p.lifecycleStatus === 'BOOKING_REQUESTED' || (p.lifecycleStatus === 'CANCELLED' && p.confirmedByClientAt === null)
}

export const CLOSED_STATUSES: ReadonlySet<ProjectLifecycle> = new Set<ProjectLifecycle>(['COMPLETED', 'CLOSED', 'CANCELLED'])

const LIFECYCLE_DISPLAY: Partial<Record<ProjectLifecycle, string>> = { COMPLETED: 'Delivered' }

export function statusLabel(status: string): string {
  const override = LIFECYCLE_DISPLAY[status as ProjectLifecycle]
  if (override) return override
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
