'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * App-wide success toasts (Carbon "toast notification": non-modal, time-based, top of screen, used
 * sparingly for confirming a completed action - carbondesignsystem.com/components/notification/usage).
 *
 * Two ways to trigger, so it works for every flow:
 *  - Inline / modal forms (no navigation): call `useToast()` after the server action resolves.
 *  - Redirect flows (the action ends with redirect): send the user to `...?toast=<code>`; this provider
 *    reads the code on mount, shows the mapped message, and strips the param (so refresh won't repeat it).
 *
 * The card reuses the success styling + countdown ring from globals (.toast-card / .toast-ring-*): it
 * auto-dismisses when the ring empties (~6s) and pauses on hover. Kept separate from the quote-specific
 * SentToast (which is driven by ?sent) - both share the same look.
 */
export type ToastInput = { title: string; subtitle?: string }
type Toast = ToastInput & { id: number }

const ToastCtx = createContext<(t: ToastInput) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

// Messages for redirect-driven toasts. Keep titles short (no full stop), Carbon style.
const CODE_MAP: Record<string, ToastInput> = {
  'client-added': { title: 'Client added' },
  'enquiry-added': { title: 'Lead added' },
  'job-created': { title: 'Converted to job' },
  'payment-recorded': { title: 'Payment recorded' },
  'invoice-created': { title: 'Invoice created' },
  'invoice-updated': { title: 'Invoice saved' },
  'quote-updated': { title: 'Quote saved' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const push = useCallback((t: ToastInput) => {
    const id = (idRef.current += 1)
    setToasts((cur) => [...cur, { ...t, id }])
  }, [])
  const dismiss = useCallback((id: number) => setToasts((cur) => cur.filter((t) => t.id !== id)), [])

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('toast')
      const mapped = code ? CODE_MAP[code] : undefined
      if (mapped) {
        push(mapped)
        url.searchParams.delete('toast')
        window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      }
    } catch {
      /* URL/history unavailable - ignore */
    }
  }, [push])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed left-4 right-4 top-20 z-50 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} title={t.title} subtitle={t.subtitle} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function ToastCard({ title, subtitle, onDismiss }: { title: string; subtitle?: string; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    // The ring drives dismissal (onAnimationEnd); reduced-motion has no ring, so fall back to a timer.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const timer = reduce ? window.setTimeout(onDismiss, 6000) : undefined
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast-card relative pointer-events-auto flex w-72 items-start gap-3 rounded-md bg-delivered p-4 shadow-lg transition-all duration-300 ease-out motion-reduce:transition-none ${entered ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
        <rect className="toast-border-track" />
        <rect className="toast-border-progress" pathLength={100} onAnimationEnd={onDismiss} />
      </svg>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-delivered-ink text-white">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.4 12 2.4 2.4 4.8-5.2" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-sm text-ink">{subtitle}</p> : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-my-1 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded text-ink transition-colors hover:bg-delivered-ink/15">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}
