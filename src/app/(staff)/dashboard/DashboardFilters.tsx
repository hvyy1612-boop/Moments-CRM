'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const PERIODS: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
]

const segClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm transition-colors ${active ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`

function dayMonth(key: string): string {
  const d = new Date(`${key}T12:00:00`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(d)
}

function ServiceSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0] ?? { value, label: value }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Service"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors hover:border-line-strong focus:border-accent"
      >
        <span className="whitespace-nowrap">{current.label}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div role="listbox" className="absolute right-0 z-50 mt-1 max-h-80 w-max min-w-full max-w-sm overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {options.map((o) => {
            const selected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm ${selected ? 'bg-sunk text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center text-accent-ink">
                  {selected ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : null}
                </span>
                <span>{o.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

const dateInput = 'h-9 rounded-md border border-line bg-surface px-2.5 text-sm text-ink outline-none transition-colors focus:border-accent'

export function DashboardFilters({ period, service, services, from, to }: { period: string; service: string; services: string[]; from?: string; to?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [customOpen, setCustomOpen] = useState(false)
  const [fromDate, setFromDate] = useState(from ?? '')
  const [toDate, setToDate] = useState(to ?? '')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setFromDate(from ?? '')
    setToDate(to ?? '')
  }, [from, to])

  useEffect(() => {
    if (!customOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCustomOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [customOpen])

  function pushParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString())
    mut(p)
    const qs = p.toString()
    router.push(qs ? `/dashboard?${qs}` : '/dashboard')
  }

  function selectPeriod(value: string) {
    if (value === 'custom') {
      setErr(null)
      setCustomOpen((o) => !o)
      return
    }
    setCustomOpen(false)
    pushParams((p) => {
      if (value === '7d') p.delete('period')
      else p.set('period', value)
      p.delete('from')
      p.delete('to')
    })
  }

  function applyCustom() {
    if (!fromDate || !toDate) {
      setErr('Choose both a From and a To date.')
      return
    }
    if (fromDate > toDate) {
      setErr('The From date must be on or before the To date.')
      return
    }
    setErr(null)
    setCustomOpen(false)
    pushParams((p) => {
      p.set('period', 'custom')
      p.set('from', fromDate)
      p.set('to', toDate)
    })
  }

  function clearCustom() {
    setFromDate('')
    setToDate('')
    setErr(null)
    setCustomOpen(false)
    pushParams((p) => {
      p.delete('period')
      p.delete('from')
      p.delete('to')
    })
  }

  const rangeLabel = period === 'custom' && from && to ? `${dayMonth(from)} – ${dayMonth(to)}` : null
  const serviceOptions = [{ value: 'all', label: 'All services' }, ...services.map((s) => ({ value: s, label: s }))]

  return (

    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center rounded-lg bg-sunk p-0.5">
          {PERIODS.map((p) => {

            const active = p.value === 'custom' ? period === 'custom' || customOpen : period === p.value && !customOpen
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => selectPeriod(p.value)}
                aria-pressed={active}
                aria-expanded={p.value === 'custom' ? customOpen : undefined}
                className={segClass(active)}
              >
                {p.label}
                {p.value === 'custom' && rangeLabel ? <span className="ml-1.5 font-normal text-ink-muted">{rangeLabel}</span> : null}
              </button>
            )
          })}
        </div>
        <ServiceSelect
          value={service}
          options={serviceOptions}
          onChange={(v) =>
            pushParams((p) => {
              if (v === 'all') p.delete('service')
              else p.set('service', v)
            })
          }
        />
      </div>

      {customOpen ? (
        <div role="group" aria-label="Custom date range" className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-end justify-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">From date</span>
              <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" className={dateInput} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">To date</span>
              <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} aria-label="To date" className={dateInput} />
            </label>
            <button type="button" onClick={clearCustom} className="h-9 rounded-md px-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink">
              Clear
            </button>
            <button type="button" onClick={applyCustom} className="h-9 rounded-md bg-ink px-3 text-sm font-medium text-surface transition-opacity hover:opacity-90">
              Apply
            </button>
          </div>
          {err ? <p className="text-xs text-danger">{err}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
