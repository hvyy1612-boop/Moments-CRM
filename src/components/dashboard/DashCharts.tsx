
import type { Bar, SeriesPoint } from '@/lib/domain/dashboard'

type Family = 'lav' | 'sage' | 'powder' | 'peach' | 'blush' | 'butter'
const FILL: Record<Family, string> = { lav: 'bg-lav-strong', sage: 'bg-sage-strong', powder: 'bg-powder-strong', peach: 'bg-peach-strong', blush: 'bg-blush-strong', butter: 'bg-butter-strong' }
const TRACK: Record<Family, string> = { lav: 'bg-lav', sage: 'bg-sage', powder: 'bg-powder', peach: 'bg-peach', blush: 'bg-blush', butter: 'bg-butter' }
const STRONG_VAR: Record<Family, string> = { lav: '--color-lav-strong', sage: '--color-sage-strong', powder: '--color-powder-strong', peach: '--color-peach-strong', blush: '--color-blush-strong', butter: '--color-butter-strong' }

export function HBars({ bars, color, format }: { bars: Bar[]; color: Family; format: (v: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div className="flex flex-col gap-2">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm text-ink">{b.label}</span>
          <div className={`h-2 flex-1 overflow-hidden rounded-full ${TRACK[color]}`}>
            <div className={`h-full rounded-full ${FILL[color]}`} style={{ width: `${Math.max(3, (b.value / max) * 100)}%` }} />
          </div>
          <span className="tabular w-14 shrink-0 text-right text-sm font-medium text-ink">{format(b.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function RevenueLines({ series }: { series: SeriesPoint[] }) {
  const max = Math.max(1, ...series.flatMap((p) => [p.booked, p.collected]))
  const n = series.length
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v: number) => 38 - (v / max) * 34
  const booked = series.map((p, i) => `${x(i)},${y(p.booked)}`).join(' ')
  const collected = series.map((p, i) => `${x(i)},${y(p.collected)}`).join(' ')
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Booked revenue and collected cash over time">
        {n > 1 ? <polygon points={`${x(0)},40 ${booked} ${x(n - 1)},40`} fill="var(--color-lav)" /> : null}
        <polyline points={booked} fill="none" stroke="var(--color-lav-strong)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={collected} fill="none" stroke="var(--color-sage-strong)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted">
        {series.map((p) => <span key={p.label}>{p.label}</span>)}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-lav-strong" />Booked revenue</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-sage-strong" />Collected cash</span>
      </div>
    </div>
  )
}

export function StageDonut({ segments, centre, family = 'sage' }: { segments: Bar[]; centre: number; family?: Family }) {
  const total = segments.reduce((s, b) => s + b.value, 0)
  let acc = 0
  const stops =
    total === 0
      ? ['var(--color-sunk) 0% 100%']
      : segments.filter((s) => s.value > 0).map((s, i) => {
          const startPct = (acc / total) * 100
          acc += s.value
          const endPct = (acc / total) * 100
          const mix = Math.max(35, 100 - i * 20)
          return `color-mix(in srgb, var(${STRONG_VAR[family]}) ${mix}%, white) ${startPct}% ${endPct}%`
        })
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ backgroundImage: `conic-gradient(${stops.join(', ')})` }}>
        <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-surface text-center">
          <span className="tabular text-xl font-semibold leading-none text-ink">{centre}</span>
          <span className="mt-0.5 text-xs text-muted">active jobs</span>
        </div>
      </div>
      <ul className="min-w-32 flex-1">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5 py-1 text-sm text-ink-muted">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: `color-mix(in srgb, var(${STRONG_VAR[family]}) ${Math.max(35, 100 - i * 20)}%, white)` }} aria-hidden="true" />
            {s.label}
            <b className="tabular ml-auto text-ink">{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StackedBar({ segments }: { segments: { label: string; value: number; color: Family }[] }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0))
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-sunk">
      {segments.filter((s) => s.value > 0).map((s) => (
        <div key={s.label} className={`h-full ${FILL[s.color]}`} style={{ width: `${(s.value / total) * 100}%` }} title={s.label} />
      ))}
    </div>
  )
}
