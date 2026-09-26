'use client'

import { useEffect, useState } from 'react'

/**
 * "Quote sent" confirmation toast. Follows the Carbon Design System toast-notification pattern (status
 * bar on the leading edge, status icon, title + subtitle, close affordance) styled in the Moments system.
 * It is non-modal, time-based and appears top-right, below the sticky header (h-16), where staff look
 * after an action. It slides in from the right and auto-dismisses.
 *
 * Driven by a `?sent=<email>` URL param, not by the sending component's state: the send action redirects
 * to the destination page with that param so the toast is owned by a STABLE page and survives the
 * re-render that unmounts the QuoteBuilder (rendered only while the quote is a DRAFT). On mount it strips
 * the param via history.replaceState (no navigation/refetch) so a manual refresh does not pop it again.
 */
export function SentToast({ email, label = 'Quote sent' }: { email: string; label?: string }) {
  const [show, setShow] = useState(true)
  // `entered` drives the slide-in from the right; toggled on the frame after mount so the transition runs.
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('sent')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    } catch {
      // history/URL unavailable (very old browser) - the toast still shows; refresh may repeat it.
    }
    const raf = requestAnimationFrame(() => setEntered(true))
    // Long enough that a busy staffer reliably notices it before it clears.
    const timer = setTimeout(() => setShow(false), 8000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [])

  if (!show) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-4 right-4 top-20 z-50 ml-auto flex max-w-sm items-start gap-3 rounded-md border border-line border-l-4 border-l-delivered-ink bg-surface p-4 shadow-lg transition-all duration-300 ease-out motion-reduce:transition-none ${entered ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-delivered text-delivered-ink">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.4 12 2.4 2.4 4.8-5.2" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {email ? <p className="mt-0.5 truncate text-sm text-ink-muted">{email}</p> : null}
      </div>
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}
