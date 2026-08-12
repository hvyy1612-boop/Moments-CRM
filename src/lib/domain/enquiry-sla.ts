import type { EnquiryStatus } from '@prisma/client'

/**
 * The enquiry response commitment (BR-E07), measured in elapsed calendar hours from creation
 * (BR-X02: calendar hours, not business hours, because the studio's public promise to clients is
 * worded as 24 hours).
 *
 * - within: still inside the 24 hour window, or already answered
 * - alert: NEW for more than 24 hours, raises a dashboard alert
 * - escalate: NEW for more than 48 hours, escalates to ADMIN
 *
 * Only a NEW enquiry can breach: once it moves to CONTACTED the response has happened, and
 * QUOTED / WON / LOST are all past that point.
 */
export const SLA_ALERT_HOURS = 24
export const SLA_ESCALATE_HOURS = 48

const HOUR_MS = 60 * 60 * 1000

export type SlaLevel = 'within' | 'alert' | 'escalate'

export function enquirySlaLevel(
  enquiry: { status: EnquiryStatus; createdAt: Date },
  now: Date,
): SlaLevel {
  if (enquiry.status !== 'NEW') return 'within'
  const elapsedHours = (now.getTime() - enquiry.createdAt.getTime()) / HOUR_MS
  if (elapsedHours > SLA_ESCALATE_HOURS) return 'escalate'
  if (elapsedHours > SLA_ALERT_HOURS) return 'alert'
  return 'within'
}

/** Wording for the SLA state, so status is communicated by text and not by colour alone (§10.3). */
export function slaLabel(level: SlaLevel): string | null {
  if (level === 'escalate') return 'Overdue, past 48 hours'
  if (level === 'alert') return 'Overdue, past 24 hours'
  return null
}
