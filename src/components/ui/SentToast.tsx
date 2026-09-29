'use client'

import { useEffect, useState } from 'react'

/**
 * "Quote sent" confirmation toast — the Carbon Design System success toast-notification pattern styled in
 * the Moments palette: a green card with a leading status bar, a round status icon, a title + subtitle and
 * a timestamp, and a close affordance. Non-modal and time-based, it slides in from the top-right (below the
 * sticky h-16 header) where staff look after an action, then auto-dismisses.
 *
 * Driven by a `?sent=<email>` URL param, not by the sending component's state: the send action redirects to
 * the destination page with that param so the toast is owned by a STABLE page and survives the re-render
 * that unmounts the QuoteBuilder (rendered only while the quote is a DRAFT). On mount it strips the param
 * via history.replaceState (no navigation/refetch) so a manual refresh does not pop it again, and it stamps
 * the current Sydney time (the toast appears the instant the send redirect lands).
 */
export function SentToast({ email, label = 'Quote sent' }: { email: string; label?: string }) {
  const [show, setShow] = useState(true)
  // `entered` drives the slide-in from the right; toggled on the frame after mount so the transition runs.
  const [entered, setEntered] = useState(false)
  const [time, setTime] = useState('')

  useEffect(() => {
    try {
      setTime(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Australia/Sydney' }))
    } catch {
      setTime('')
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('sent')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    } catch {
      // history/URL unavailable (very old browser) - the toast still shows; refresh may repeat it.
    }
    const raf = requestAnimationFrame(() => setEntered(true))
    // The countdown ring drives auto-dismiss (onAnimationEnd fires when the ring empties, ~6s; it pauses
    // while hovered). Reduced-motion users get no ring animation, so fall back to a plain timer.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const timer = reduce ? window.setTimeout(() => setShow(false), 6000) : undefined
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!show) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast-card fixed right-4 top-20 z-50 flex w-72 items-start gap-3 rounded-md bg-delivered p-4 shadow-lg transition-all duration-300 ease-out motion-reduce:transition-none ${entered ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
    >
      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
        <svg viewBox="0 0 28 28" className="absolute inset-0 h-7 w-7 -rotate-90" fill="none" aria-hidden="true">
          <circle className="toast-ring-track" cx="14" cy="14" r="12" strokeWidth={2} />
          <circle className="toast-ring-progress" cx="14" cy="14" r="12" strokeWidth={2} strokeLinecap="round" onAnimationEnd={() => setShow(false)} />
        </svg>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-delivered-ink text-white">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.4 12 2.4 2.4 4.8-5.2" /></svg>
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {email ? <p className="mt-0.5 truncate text-sm text-ink">Sent to {email}</p> : null}
        {time ? <p className="mt-1.5 text-xs text-delivered-ink">{time}</p> : null}
      </div>
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss" className="-my-1 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded text-ink transition-colors hover:bg-delivered-ink/15">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}
