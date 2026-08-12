import type { EnquiryStatus } from '@prisma/client'

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

export function slaLabel(level: SlaLevel): string | null {
  if (level === 'escalate') return 'Overdue, past 48 hours'
  if (level === 'alert') return 'Overdue, past 24 hours'
  return null
}
