'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const PERIODS: { value: string; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'year', label: 'This year' },
]

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
      <select
        value={service}
        onChange={(e) => set('service', e.target.value, 'all')}
        aria-label="Service"
        className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
      >
        <option value="all">All services</option>
        {services.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )
}
