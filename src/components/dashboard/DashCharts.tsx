/**
 * Dashboard charts - lightweight SVG/flex, no charting library. Colour lives in the data via the
 * dashboard palette tokens (--color-dash-*). Callers pass explicit colours so the same business concept
 * keeps the same colour across charts. Load-in animation + line glow are defined in globals.css.
 */
import type { Bar, SeriesPoint } from '@/lib/domain/dashboard'

/** Horizontal bars: label · track · value. One colour per bar (cycled from `colors`). */
export function HBars({ bars, colors, format }: { bars: Bar[]; colors: string[]; format: (v: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div className="flex w-full flex-col gap-3">
      {bars.map((b, i) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-sm leading-snug text-ink-muted">{b.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunk">
            <div className="dash-fillx h-full rounded-full" style={{ width: `${Math.max(3, (b.value / max) * 100)}%`, backgroundColor: colors[i % colors.length] }} />
          </div>
          <span className="tabular w-16 shrink-0 text-right text-sm font-medium text-ink">{format(b.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Donut with a distinct colour per segment, a centre figure + label, and a value legend. */
export function Donut({ segments, colors, centre, centreLabel, format }: { segments: Bar[]; colors: string[]; centre: string; centreLabel: string; format: (v: number) => string }) {
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
      stops.push(`${colors[i % colors.length]} ${startPct}% ${(acc / total) * 100}%`)
    })
  }
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="dash-depth relative h-32 w-32 shrink-0 rounded-full" style={{ backgroundImage: `conic-gradient(${stops.join(', ')})` }}>
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-surface px-1 text-center leading-none">
          <span className="text-lg font-semibold text-ink">{centre}</span>
          <span className="donut-sub mt-1 text-muted">{centreLabel}</span>
        </div>
      </div>
      <ul className="min-w-32 flex-1 space-y-1.5">
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

/**
 * Combined chart: monthly income as columns + the number of bookings as a glowing line on its own
 * (right) scale, so income can be read against volume. Both axes are implicit.
 */
export function ComboChart({ series }: { series: SeriesPoint[] }) {
  const n = series.length
  const revMax = Math.max(1, ...series.map((p) => p.booked))
  const bkMax = Math.max(1, ...series.map((p) => p.bookings))
  const TOP = 3
  const BOTTOM = 39
  const H = BOTTOM - TOP
  const cx = (i: number) => (n <= 1 ? 50 : ((i + 0.5) / n) * 100)
  const barW = n > 0 ? (100 / n) * 0.5 : 0
  const yRev = (v: number) => BOTTOM - (v / revMax) * H
  const yBk = (v: number) => BOTTOM - (v / bkMax) * H
  const line = series.map((p, i) => `${cx(i)},${yBk(p.bookings)}`).join(' ')
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-dash-blue)' }} />Income</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-dash-steel)' }} />Bookings</span>
      </div>
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Income (columns) and bookings (line) by month">
        <defs>
          <filter id="dashGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {[0, 0.5, 1].map((f) => <line key={f} x1="0" y1={BOTTOM - f * H} x2="100" y2={BOTTOM - f * H} stroke="var(--color-line)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />)}
        {series.map((p, i) => <rect key={i} className="dash-svgbar" x={cx(i) - barW / 2} y={yRev(p.booked)} width={barW} height={Math.max(0, BOTTOM - yRev(p.booked))} rx={0.6} fill="var(--color-dash-blue)" />)}
        {n > 1 ? <polyline className="dash-line" points={line} fill="none" stroke="var(--color-dash-steel)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" filter="url(#dashGlow)" /> : null}
      </svg>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        {series.map((p, i) => <span key={i}>{p.label}</span>)}
      </div>
    </div>
  )
}

/** Clustered columns: two money series (billed vs collected) side by side per bucket. */
export function ClusteredColumns({ series }: { series: SeriesPoint[] }) {
  const max = Math.max(1, ...series.flatMap((p) => [p.booked, p.collected]))
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-dash-blue)' }} />Billed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-dash-peach)' }} />Collected</span>
      </div>
      <div className="flex h-32 items-end gap-2">
        {series.map((p, i) => (
          <div key={i} className="flex h-full flex-1 items-end gap-1">
            <div className="dash-barY min-h-0.5 flex-1 rounded-t-sm" style={{ height: `${(p.booked / max) * 100}%`, backgroundColor: 'var(--color-dash-blue)' }} />
            <div className="dash-barY min-h-0.5 flex-1 rounded-t-sm" style={{ height: `${(p.collected / max) * 100}%`, backgroundColor: 'var(--color-dash-peach)' }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        {series.map((p, i) => <span key={i} className="flex-1 text-center">{p.label}</span>)}
      </div>
    </div>
  )
}

/** Vertical columns with a value label above each bar. One colour per bar (cycled). */
export function Column({ bars, colors, format }: { bars: Bar[]; colors: string[]; format: (v: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div>
      <div className="mb-1 flex gap-2 text-xs font-medium text-ink-muted">
        {bars.map((b) => <span key={b.label} className="tabular flex-1 text-center">{format(b.value)}</span>)}
      </div>
      <div className="flex h-28 items-end gap-2">
        {bars.map((b, i) => (
          <div key={b.label} className="dash-barY min-h-0.5 flex-1 rounded-t-sm" style={{ height: `${(b.value / max) * 100}%`, backgroundColor: colors[i % colors.length] }} />
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 text-xs text-muted">
        {bars.map((b) => <span key={b.label} className="flex-1 truncate text-center">{b.label}</span>)}
      </div>
    </div>
  )
}

/** Funnel: descending stages, each a labelled bar whose width is its share of the top stage. */
export function Funnel({ bars, format }: { bars: Bar[]; format: (v: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div className="flex flex-col gap-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2.5">
          <span className="w-28 shrink-0 text-xs leading-snug text-ink-muted">{b.label}</span>
          <div className="flex h-6 flex-1 items-center">
            <div className="dash-fillx flex h-full min-w-6 items-center rounded-sm px-2 text-xs font-semibold text-white" style={{ width: `${Math.max(6, (b.value / max) * 100)}%`, backgroundColor: 'var(--color-dash-blue)' }}>
              {format(b.value)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Pie with value + percent callouts on leader lines (Power BI style) and a colour legend below. */
export function PieChart({ segments, colors, format }: { segments: Bar[]; colors: string[]; format: (v: number) => string }) {
  const total = segments.reduce((s, b) => s + b.value, 0) || 1
  const cx = 90
  const cy = 85
  const r = 66
  const pt = (ang: number, rad: number): [number, number] => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
  let acc = 0
  const slices = segments
    .map((s, i) => {
      if (s.value <= 0) return null
      const f0 = acc / total
      acc += s.value
      const f1 = acc / total
      const a0 = (-90 + f0 * 360) * (Math.PI / 180)
      const a1 = (-90 + f1 * 360) * (Math.PI / 180)
      const amid = (-90 + ((f0 + f1) / 2) * 360) * (Math.PI / 180)
      const [x0, y0] = pt(a0, r)
      const [x1, y1] = pt(a1, r)
      const [ex, ey] = pt(amid, r)
      const [ox, oy] = pt(amid, r + 12)
      const large = f1 - f0 > 0.5 ? 1 : 0
      const right = Math.cos(amid) >= 0
      const colX = right ? cx + r + 34 : cx - r - 34
      return {
        key: s.label,
        color: colors[i % colors.length],
        path: `M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`,
        leader: `${ex.toFixed(1)},${ey.toFixed(1)} ${ox.toFixed(1)},${oy.toFixed(1)} ${colX},${oy.toFixed(1)}`,
        labelX: right ? colX + 3 : colX - 3,
        labelY: oy,
        anchor: (right ? 'start' : 'end') as 'start' | 'end',
        pct: Math.round((s.value / total) * 100),
        value: s.value,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  return (
    <div>
      <svg viewBox="-92 0 364 176" className="h-44 w-full" role="img" aria-label="Income by service type">
        {slices.map((sl) => <path key={`p-${sl.key}`} d={sl.path} fill={sl.color} stroke="var(--color-surface)" strokeWidth={2} />)}
        {slices.map((sl) => <polyline key={`l-${sl.key}`} points={sl.leader} fill="none" stroke="var(--color-muted)" strokeWidth={1} />)}
        {slices.map((sl) => <text key={`t-${sl.key}`} x={sl.labelX} y={sl.labelY + 3} textAnchor={sl.anchor} fontSize={10} fontWeight={600} fill="var(--color-ink)">{format(sl.value)} ({sl.pct}%)</text>)}
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
