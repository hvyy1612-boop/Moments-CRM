'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { Alert } from '@/lib/domain/alerts'

/** Relative "2h ago" / "3d ago" label for a recent event. */
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Top-nav notification bell. Surfaces recent workflow events (new enquiries, payments received) from
 * real data - separate from Activity (the audit trail). The badge counts items from the last 7 days;
 * there is no persistent per-user read state in the schema, so it does not claim a stored unread count.
 */
/** `canViewActivity`: the Activity log is admin only, so other roles get no link to it (it would 404). */
export function NotificationBell({ alerts, canViewActivity }: { alerts: Alert[]; canViewActivity: boolean }) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Compute the "recent" badge on the client so the server render (no wall clock) stays stable.
  useEffect(() => {
    const now = Date.now()
    setRecent(alerts.filter((a) => now - new Date(a.at).getTime() < WEEK_MS).length)
  }, [alerts])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={recent > 0 ? `Notifications, ${recent} recent` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {recent > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold leading-none text-surface">
            {recent > 9 ? '9+' : recent}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {canViewActivity ? (
              <Link href="/activity" onClick={() => setOpen(false)} className="text-xs font-medium text-accent-ink hover:underline">
                View activity
              </Link>
            ) : null}
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-paper"
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.kind === 'payment' ? 'bg-delivered text-delivered-ink' : 'bg-accent-tint text-accent-ink'}`}>
                      {a.kind === 'payment' ? (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.7 7 6.8s2 2.7 5 3.4 5 1.4 5 3.5-2.2 3.3-5 3.3-5-1.1-5-3" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{a.title}</span>
                      {a.detail ? <span className="block truncate text-sm text-ink-muted">{a.detail}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{ago(a.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
