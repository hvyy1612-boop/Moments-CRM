'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { Alert } from '@/lib/domain/alerts'
import { Button } from '@/components/ui/Button'
import { alertTint, KindIcon, when } from '@/components/notification-ui'
import { markNotificationsReadAction } from './actions'

type Tab = 'all' | 'unread' | 'alerts'

/**
 * The full "See all notifications" HISTORY - unlike the bell (an inbox that empties on read), this page
 * keeps everything so staff can look back at past notifications. All (read + unread) / Unread / Alerts
 * tabs, per-item unread dots, Mark all read (clears the dots; the items stay). `when(displayAt ?? at)`.
 */
export function NotificationsList({ alerts, seenAt }: { alerts: Alert[]; seenAt: Date | null }) {
  const [tab, setTab] = useState<Tab>('all')
  const [markedAt, setMarkedAt] = useState<Date | null>(null)
  const [, startTransition] = useTransition()

  const effectiveSeen = markedAt ?? seenAt
  const isUnread = (a: Alert) => !effectiveSeen || new Date(a.at).getTime() > new Date(effectiveSeen).getTime()
  const unread = alerts.filter(isUnread)
  const alertItems = alerts.filter((a) => a.category === 'alert')
  const visible = tab === 'unread' ? unread : tab === 'alerts' ? alertItems : alerts

  const markRead = () => {
    if (unread.length === 0) return
    setMarkedAt(new Date())
    startTransition(() => { void markNotificationsReadAction() })
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: alerts.length },
    { key: 'unread', label: 'Unread', count: unread.length },
    { key: 'alerts', label: 'Alerts', count: alertItems.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-paper'}`}
            >
              {t.label}
              {t.count > 0 ? (
                <span className={`tabular rounded-full px-1.5 text-xs leading-tight ${tab === t.key ? 'bg-surface/20 text-surface' : t.key === 'alerts' ? 'bg-lost text-lost-ink' : 'bg-sunk text-ink-muted'}`}>{t.count}</span>
              ) : null}
            </button>
          ))}
        </div>
        {unread.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={markRead}>Mark all read</Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-line-strong bg-surface px-4 py-12 text-center text-sm text-ink-muted">
          {tab === 'unread' ? 'No unread notifications.' : tab === 'alerts' ? 'Nothing needs attention right now.' : 'No notifications yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line-strong bg-surface">
          {visible.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex items-start gap-3 px-4 py-3 hover:bg-paper">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${alertTint(a.kind)}`}>
                  <KindIcon kind={a.kind} size="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{a.title}</span>
                  {a.detail ? <span className="block break-words text-sm text-ink-muted">{a.detail}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="whitespace-nowrap text-xs text-muted">{when(a.displayAt ?? a.at)}</span>
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
