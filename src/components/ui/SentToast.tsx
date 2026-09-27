'use client'

import { useEffect, useState } from 'react'

export function SentToast({ email, label = 'Quote sent' }: { email: string; label?: string }) {
  const [show, setShow] = useState(true)

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

    const timer = setTimeout(() => setShow(false), 5 * 60 * 1000)
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
