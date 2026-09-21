'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const PERIODS: { value: string; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'year', label: 'This year' },
]

/**
 * Service filter as a custom dropdown so the trigger stays compact (fits the selected label + chevron)
 * while the menu is free to expand wider than the trigger and show long service names in full - a
 * native <select> sizes its trigger to the widest option, which is what made it too wide. Same visual
 * language as the rest of the CRM (rounded-lg, border-line, bg-surface, text-sm).
 */
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
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1 max-h-80 w-max min-w-full max-w-sm overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
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

export function DashboardFilters({ period, service, services }: { period: string; service: string; services: string[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function set(key: string, value: string, def: string) {
    const p = new URLSearchParams(params.toString())
    if (value === def) p.delete(key)
    else p.set(key, value)
    const qs = p.toString()
    router.push(qs ? `/dashboard?${qs}` : '/dashboard')
  }

  const serviceOptions = [{ value: 'all', label: 'All services' }, ...services.map((s) => ({ value: s, label: s }))]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg bg-sunk p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => set('period', p.value, '90d')}
            aria-pressed={period === p.value}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${period === p.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <ServiceSelect value={service} options={serviceOptions} onChange={(v) => set('service', v, 'all')} />
    </div>
  )
}
