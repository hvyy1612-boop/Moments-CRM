import type { ActorType, Prisma } from '@prisma/client'
import { formatSydneyDate } from '@/lib/time'

export type TimelineEntry = {
  id: string
  action: string
  actorType: ActorType
  detailJson: Prisma.JsonValue
  createdAt: Date
  actor: { name: string } | null
}

const WORDING: Record<string, string> = {
  'enquiry.created': 'Enquiry received from the website',
  'enquiry.merged': 'A second enquiry for the same date was merged into this one',
  'enquiry.contacted': 'Marked as contacted',
  'enquiry.lost': 'Marked as lost',
  'enquiry.reopened': 'Reopened after being marked lost',
  'enquiry.lostReasonChanged': 'Reason lost changed',
  'enquiry.assigned': 'Assigned',
  'enquiry.unassigned': 'Assignment cleared',
  'client.viewed': 'Client record opened',
  'notification.queued': 'Message queued',
}

function actorLabel(entry: TimelineEntry): string {
  if (entry.actorType === 'STAFF') return entry.actor?.name ?? 'A staff member'
  if (entry.actorType === 'CLIENT') return 'The client'
  return 'The system'
}

function extra(entry: TimelineEntry): string | null {
  const detail = entry.detailJson
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  const record = detail as Record<string, unknown>
  if (typeof record.reason === 'string') return record.reason
  if (typeof record.assignedTo === 'string') return `to ${record.assignedTo}`

  if (typeof record.from === 'string' && typeof record.to === 'string') {
    if (entry.action === 'enquiry.lostReasonChanged') return `${record.from} to ${record.to}`
    if (entry.action === 'enquiry.reopened') return `back to ${record.to.toLowerCase()}`
  }
  return null
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing has happened yet. Actions on this enquiry will be listed here.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const isSystem = entry.actorType === 'SYSTEM'
        const note = extra(entry)
        return (
          <li key={entry.id} className="flex gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${isSystem ? 'bg-line' : 'bg-accent'}`}
              aria-hidden="true"
            />
            <div>
              <p className={`text-sm ${isSystem ? 'text-ink-muted' : 'text-ink'}`}>
                {WORDING[entry.action] ?? entry.action}
                {note ? `: ${note}` : ''}
              </p>
              <p className="text-xs text-ink-muted">
                {actorLabel(entry)} · {formatSydneyDate(entry.createdAt)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
