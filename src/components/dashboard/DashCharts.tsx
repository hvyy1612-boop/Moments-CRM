
import type { Bar, SeriesPoint } from '@/lib/domain/dashboard'

export function HBars({ bars, colors, format }: { bars: Bar[]; colors: string[]; format: (v: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div className="flex w-full flex-col gap-3">
      {bars.map((b, i) => (
        <div key={b.label} className="flex items-center gap-3">
          {/* Wraps instead of truncating, so a long stage name (e.g. "Awaiting booking confirmation") reads in full. */}
          <span className="w-36 shrink-0 text-sm leading-snug text-ink-muted">{b.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunk">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(3, (b.value / max) * 100)}%`, backgroundColor: colors[i % colors.length] }}
            />
          </div>
          <span className="tabular w-16 shrink-0 text-right text-sm font-medium text-ink">{format(b.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Donut({
  segments,
  colors,
  centre,
  centreLabel,
  format,
}: {
  segments: Bar[]
  colors: string[]
  centre: string
  centreLabel: string
  format: (v: number) => string
}) {
  const total = segments.reduce((s, b) => s + b.value, 0)
  const stops: string[] = []
  if (total <= 0) {
    stops.push('var(--color-sunk) 0% 100%')
  } else {
    let acc = 0
    segments.forEach((s, i) => {
      if (s.value <= 0) return
      const startPct = (acc / total) * 100
      acc += s.value
      const endPct = (acc / total) * 100
      stops.push(`${colors[i % colors.length]} ${startPct}% ${endPct}%`)
    })
  }
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ backgroundImage: `conic-gradient(${stops.join(', ')})` }}>
        <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full bg-surface px-1 text-center leading-none">
          <span className="text-lg font-semibold text-ink">{centre}</span>
          <span className="donut-sub mt-1 text-muted">{centreLabel}</span>
        </div>
      </div>
      <ul className="min-w-36 flex-1 space-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm text-ink-muted">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} aria-hidden="true" />
            <span className="truncate">{s.label}</span>
            <b className="tabular ml-auto font-medium text-ink">{format(s.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RevenueChart({ series, format }: { series: SeriesPoint[]; format: (v: number) => string }) {
  const max = Math.max(1, ...series.flatMap((p) => [p.booked, p.collected]))
  const n = series.length
  const TOP = 3
  const BOTTOM = 39
  const H = BOTTOM - TOP
  const y = (v: number) => BOTTOM - (v / max) * H
  const cx = (i: number) => (n <= 1 ? 50 : ((i + 0.5) / n) * 100)
  const barW = n > 0 ? (100 / n) * 0.44 : 0
  const line = series.map((p, i) => `${cx(i)},${y(p.collected)}`).join(' ')
  const gridFracs = [0, 0.5, 1]
  return (
    <div>
      <div className="flex gap-2">
        <div className="tabular flex h-44 w-12 shrink-0 flex-col justify-between py-0 text-right text-xs text-muted">
          <span>{format(max)}</span>
          <span>{format(max / 2)}</span>
          <span>{format(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="Booked revenue (bars) and collected cash (line) over time">
            {gridFracs.map((f) => {
              const gy = BOTTOM - f * H
              return <line key={f} x1="0" y1={gy} x2="100" y2={gy} stroke="var(--color-line)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
            })}
            {series.map((p, i) => (
              <rect key={p.label} x={cx(i) - barW / 2} y={y(p.booked)} width={barW} height={Math.max(0, BOTTOM - y(p.booked))} fill="var(--color-data-deep-sage)" />
            ))}
            {n > 1 ? (
              <polyline points={line} fill="none" stroke="var(--color-data-blue)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
          </svg>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            {series.map((p) => (
              <span key={p.label}>{p.label}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-data-deep-sage)' }} />
          Booked revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-data-blue)' }} />
          Collected cash
        </span>
      </div>
    </div>
  )
}
