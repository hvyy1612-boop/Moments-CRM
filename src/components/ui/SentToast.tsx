'use client'

import { useEffect, useState } from 'react'

/**
 * "Quote sent" confirmation toast (Option A). Driven by a `?sent=<email>` URL param rather than by the
 * sending component's own state: the send action redirects to the destination page with that param, so
 * the toast is owned by a stable page and survives the re-render that unmounts the QuoteBuilder (which is
 * only rendered while the quote is still a DRAFT). On mount it strips the param from the URL with
 * history.replaceState (no navigation/refetch) so a manual refresh does not pop the toast again.
 */
export function SentToast({ email, label = 'Quote sent' }: { email: string; label?: string }) {
  const [show, setShow] = useState(true)
  // `entered` drives a short slide-up + fade-in so the toast catches the eye right after the page
  // navigation that lands here — a corner toast that just pops is easy to miss.
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
    // Generous, so it is not missed while the destination page is still settling after the redirect.
    const timer = setTimeout(() => setShow(false), 6000)
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
      className={`fixed bottom-4 right-4 z-50 flex w-full max-w-xs items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 shadow-lg transition-all duration-300 ease-out motion-reduce:transition-none ${entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-delivered text-delivered-ink">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.4 12 2.4 2.4 4.8-5.2" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {email ? <p className="truncate text-xs text-ink-muted">{email}</p> : null}
      </div>
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}
