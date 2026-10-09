'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
]

/** "2026-09-01" -> "01 Sep" (noon parse avoids a timezone day-shift on the label). */
function dayMonth(key: string): string {
  const d = new Date(`${key}T12:00:00`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(d)
}

/**
 * One slicer, rendered as a compact pill with a coloured dot, a muted label and the selected value, plus
 * a drop-down menu. The menu can grow wider than the trigger so long names (occasions) read in full.
 */
function Slicer({ label, dot, value, options, onPick }: { label: string; dot: string; value: string; options: { value: string; label: string }[]; onPick: (v: string) => void }) {
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
        aria-label={label}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-card-border bg-surface px-3 text-sm text-ink outline-none transition-colors hover:border-ink-muted focus:border-accent"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden="true" />
        <span className="whitespace-nowrap text-ink-muted">{label}:</span>
        <span className="whitespace-nowrap font-medium">{current.label}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open ? (
        <div role="listbox" className="absolute right-0 z-50 mt-1 max-h-80 w-max min-w-full max-w-sm overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {options.map((o) => {
            const selected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onPick(o.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm ${selected ? 'bg-sunk text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center text-accent-ink">
                  {selected ? <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg> : null}
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

const dateInput = 'h-9 rounded-md border border-card-border bg-surface px-2.5 text-sm text-ink outline-none transition-colors focus:border-accent'

export function DashboardFilters({ period, occasion, coverage, occasions, coverages, from, to }: { period: string; occasion: string; coverage: string; occasions: string[]; coverages: string[]; from?: string; to?: string }) {
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

  // Mutate the query string, preserving the other filters (and ?preview=1) so slicers compose.
  function pushParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString())
    mut(p)
    const qs = p.toString()
    router.push(qs ? `/dashboard?${qs}` : '/dashboard')
  }

  function pickPeriod(value: string) {
    if (value === 'custom') {
      setErr(null)
      setCustomOpen(true)
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
      setErr('Please choose both a From and a To date.')
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

  const periodValue = customOpen ? 'custom' : period
  const rangeLabel = period === 'custom' && from && to ? `${dayMonth(from)} - ${dayMonth(to)}` : null
  const periodOptions: { value: string; label: string }[] = PERIOD_OPTIONS.map((o) => (o.value === 'custom' && rangeLabel ? { value: 'custom', label: rangeLabel } : o))

  const coverageOptions = [{ value: 'all', label: 'All' }, ...coverages.map((c) => ({ value: c, label: c }))]
  const occasionOptions = [{ value: 'all', label: 'All' }, ...occasions.map((o) => ({ value: o, label: o }))]

  const row: ReactNode = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Slicer label="Period" dot="var(--color-dash-steel)" value={periodValue} options={periodOptions} onPick={pickPeriod} />
      <Slicer label="Service" dot="var(--color-dash-blue)" value={coverage} options={coverageOptions} onPick={(v) => pushParams((p) => (v === 'all' ? p.delete('coverage') : p.set('coverage', v)))} />
      <Slicer label="Occasion" dot="var(--color-dash-peach)" value={occasion} options={occasionOptions} onPick={(v) => pushParams((p) => (v === 'all' ? p.delete('occasion') : p.set('occasion', v)))} />
    </div>
  )

  return (
    <div className="flex flex-col items-end gap-2">
      {row}
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
            <button type="button" onClick={clearCustom} className="h-9 rounded-md px-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink">Clear</button>
            <button type="button" onClick={applyCustom} className="h-9 rounded-md bg-ink px-3 text-sm font-medium text-surface transition-opacity hover:opacity-90">Apply</button>
          </div>
          {err ? <p className="text-xs text-danger">{err}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
