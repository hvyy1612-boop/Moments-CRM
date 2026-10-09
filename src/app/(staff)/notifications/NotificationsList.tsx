'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { Alert } from '@/lib/domain/alerts'
import { Button } from '@/components/ui/Button'
import { markNotificationsReadAction } from './actions'

/** Relative "2h ago" / "3d ago" label (client-only; the full page never SSRs this list statically). */
function ago(at: Date): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

type Tab = 'all' | 'unread'

/** The full "See all notifications" list: All / Unread tabs, Mark all read, and per-item unread dots. */
export function NotificationsList({ alerts, seenAt }: { alerts: Alert[]; seenAt: Date | null }) {
  const [tab, setTab] = useState<Tab>('all')
  const [markedAt, setMarkedAt] = useState<Date | null>(null)
  const [, startTransition] = useTransition()

  const effectiveSeen = markedAt ?? seenAt
  const isUnread = (a: Alert) => !effectiveSeen || new Date(a.at).getTime() > new Date(effectiveSeen).getTime()
  const unread = alerts.filter(isUnread)
  const visible = tab === 'unread' ? unread : alerts

  const markRead = () => {
    if (unread.length === 0) return
    setMarkedAt(new Date())
    startTransition(() => { void markNotificationsReadAction() })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(['all', 'unread'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-paper'}`}
            >
              {t === 'unread' ? `Unread${unread.length > 0 ? ` (${unread.length})` : ''}` : 'All'}
            </button>
          ))}
        </div>
        {unread.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={markRead}>Mark all read</Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-line-strong bg-surface px-4 py-12 text-center text-sm text-ink-muted">
          {tab === 'unread' ? 'No unread notifications.' : "You're all caught up."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line-strong bg-surface">
          {visible.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex items-start gap-3 px-4 py-3 hover:bg-paper">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.kind === 'payment' ? 'bg-delivered text-delivered-ink' : 'bg-accent-tint text-accent-ink'}`}>
                  {a.kind === 'payment' ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.7 7 6.8s2 2.7 5 3.4 5 1.4 5 3.5-2.2 3.3-5 3.3-5-1.1-5-3" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{a.title}</span>
                  {a.detail ? <span className="block break-words text-sm text-ink-muted">{a.detail}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="whitespace-nowrap text-xs text-muted">{ago(a.at)}</span>
                  {isUnread(a) ? <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" /> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
