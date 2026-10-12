'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { Alert } from '@/lib/domain/alerts'
import { alertTint, KindIcon, when } from '@/components/notification-ui'
import { markNotificationsReadAction } from '@/app/(staff)/notifications/actions'

type Tab = 'all' | 'unread' | 'alerts'

/**
 * Top-nav notification bell. Surfaces recent workflow events (new enquiries, payments) AND standing
 * alerts (overdue payments, upcoming shoots) from real data - separate from Activity (the audit trail).
 * Read state is a single per-user marker (User.notificationsSeenAt): "unread" = PAST-dated items newer
 * than the marker (a future shoot reminder never sticks in the badge), and "Mark all read" moves the
 * marker to now. Tabs: All / Unread (count) / Alerts (count); the badge counts unread.
 */
export function NotificationBell({
  alerts,
  seenAt,
  canViewActivity,
}: {
  alerts: Alert[]
  seenAt: Date | null
  /** The Activity log is admin only, so other roles get no link to it (it would 404). */
  canViewActivity: boolean
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  // Optimistic "just marked read": clears the badge instantly while the server action persists.
  const [markedAt, setMarkedAt] = useState<Date | null>(null)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // seenAt + a.at are server-provided dates (no wall clock), so unread is stable across SSR/hydration.
  // Clamp to the past: a future-dated shoot reminder is shown but never counts as "unread".
  const effectiveSeen = markedAt ?? seenAt
  const isUnread = (a: Alert) => new Date(a.at).getTime() <= Date.now() && (!effectiveSeen || new Date(a.at).getTime() > new Date(effectiveSeen).getTime())
  const unread = alerts.filter(isUnread)
  const alertItems = alerts.filter((a) => a.category === 'alert')
  const visible = tab === 'unread' ? unread : tab === 'alerts' ? alertItems : alerts

  const markRead = () => {
    if (unread.length === 0) return
    setMarkedAt(new Date())
    startTransition(() => { void markNotificationsReadAction() })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: 0 },
    { key: 'unread', label: 'Unread', count: unread.length },
    { key: 'alerts', label: 'Alerts', count: alertItems.length },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread.length > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold leading-none text-surface">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread.length > 0 ? (
              <button type="button" onClick={markRead} className="text-xs font-medium text-accent-ink hover:underline">Mark all read</button>
            ) : null}
          </div>

          {/* Tabs: All / Unread / Alerts, each with a live count. */}
          <div className="flex gap-1 border-b border-line px-2 py-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${tab === t.key ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-paper'}`}
              >
                {t.label}
                {t.count > 0 ? (
                  <span className={`tabular rounded-full px-1.5 text-xs leading-tight ${tab === t.key ? 'bg-surface/20 text-surface' : t.key === 'alerts' ? 'bg-lost text-lost-ink' : 'bg-sunk text-ink-muted'}`}>{t.count}</span>
                ) : null}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              {tab === 'unread' ? 'No unread notifications.' : tab === 'alerts' ? 'Nothing needs attention.' : "You're all caught up."}
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {visible.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-paper">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${alertTint(a.kind)}`}>
                      <KindIcon kind={a.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{a.title}</span>
                      {a.detail ? <span className="block truncate text-sm text-ink-muted">{a.detail}</span> : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-xs text-muted">{when(a.at)}</span>
                      {isUnread(a) ? <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" /> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-line px-4 py-2">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-accent-ink hover:underline">
              See all notifications
            </Link>
            {canViewActivity ? (
              <Link href="/activity" onClick={() => setOpen(false)} className="text-xs font-medium text-ink-muted hover:text-ink hover:underline">
                Activity
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
