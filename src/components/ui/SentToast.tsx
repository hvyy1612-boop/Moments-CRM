'use client'

import { useEffect, useState } from 'react'

export function SentToast({ email, label = 'Quote sent' }: { email: string; label?: string }) {
  const [show, setShow] = useState(true)

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
      <svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
        <rect className="toast-border-track" />
        <rect className="toast-border-progress" pathLength={100} onAnimationEnd={() => setShow(false)} />
      </svg>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-delivered-ink text-white">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.4 12 2.4 2.4 4.8-5.2" /></svg>
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
