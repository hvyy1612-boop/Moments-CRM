'use client'

import { useEffect, useRef, useState } from 'react'
import { NONE_SCHEDULE_LABEL as NONE_LABEL, SCHEDULE_PRESETS, scheduleLabel, type ScheduleKey } from '@/features/finance/payment-schedule'

/**
 * Payment schedule picker: one dropdown with a search field, "No split payments" and the preset schedules
 * grouped under "Custom". The selected row is a restrained pale green (semantic "chosen", not the brand
 * accent). Shoot-date presets are disabled until the job has a shoot date.
 */
export function PaymentScheduleSelect({
  id,
  value,
  onChange,
  shootDate,
}: {
  id?: string
  value: ScheduleKey
  onChange: (key: ScheduleKey) => void
  shootDate: string | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = (label: string) => !q || label.toLowerCase().includes(q)
  const showNone = matches(NONE_LABEL)
  const presets = SCHEDULE_PRESETS.filter((p) => matches(p.label))

  function pick(key: ScheduleKey) {
    onChange(key)
    setOpen(false)
    setQuery('')
  }

  const optionClass = (selected: boolean, disabled: boolean) =>
    `flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors ${
      selected ? 'bg-delivered text-delivered-ink' : disabled ? 'cursor-not-allowed text-muted' : 'text-ink hover:bg-sunk'
    }`

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded border bg-surface px-3 text-left text-sm text-ink transition-colors ${
          open ? 'border-accent ring-1 ring-accent' : 'border-ink'
        }`}
      >
        <span className="truncate">{scheduleLabel(value)}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded border border-line bg-surface p-1 shadow-sm">
          <div className="relative p-1">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search"
              aria-label="Search payment schedules"
              className="h-9 w-full rounded border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
            />
          </div>
          <div role="listbox" aria-label="Payment schedule" className="max-h-72 overflow-y-auto py-1">
            {showNone ? (
              <button type="button" role="option" aria-selected={value === 'NONE'} onClick={() => pick('NONE')} className={optionClass(value === 'NONE', false)}>
                {NONE_LABEL}
              </button>
            ) : null}
            {presets.length > 0 ? <p className="px-3 pb-1 pt-2 text-xs text-muted">Custom</p> : null}
            {presets.map((p) => {
              // Every preset is selectable. A shoot-based one on a job with no shoot date yet still works -
              // its balance due date is just left blank for now (hint below) and can be set later.
              const noShootYet = p.needsShoot && !shootDate
              return (
                <button
                  key={p.key}
                  type="button"
                  role="option"
                  aria-selected={value === p.key}
                  onClick={() => pick(p.key)}
                  className={optionClass(value === p.key, false)}
                >
                  <span>{p.label}</span>
                  {noShootYet ? <span className="ml-auto shrink-0 text-xs text-muted">No shoot date yet</span> : null}
                </button>
              )
            })}
            {!showNone && presets.length === 0 ? <p className="px-3 py-2 text-sm text-ink-muted">No matches</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
