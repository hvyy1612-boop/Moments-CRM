import type { DueTone } from '@/features/enquiries/workflow'

/** A due-date reminder chip: overdue, due today, or due soon. Nothing for tasks not near their date. */
export function ReminderChip({ tone }: { tone: DueTone }) {
  if (!tone) return null
  const map: Record<'overdue' | 'today' | 'soon', { c: string; label: string }> = {
    overdue: { c: 'bg-lost text-lost-ink', label: 'Overdue' },
    today: { c: 'bg-accent-tint text-accent-ink', label: 'Due today' },
    soon: { c: 'bg-sunk text-ink-muted', label: 'Due soon' },
  }
  const m = map[tone]
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${m.c}`}>{m.label}</span>
}

/** Shows that a task is waiting for a prerequisite before it can be started. */
export function BlockedChip({ blockedBy }: { blockedBy: string | null }) {
  if (!blockedBy) return null
  return (
    <span className="rounded bg-sunk px-1.5 py-0.5 text-xs text-ink-muted">Waiting for {blockedBy}</span>
  )
}
