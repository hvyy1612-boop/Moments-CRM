/**
 * Lightweight charts drawn with CSS/SVG only — no charting library, so the bundle stays tiny and
 * nothing loads from a third party (docs/20). Colours are passed as design-token CSS variables.
 */

type Segment = { label: string; value: number; varName: string }

/** Status distribution as a donut (conic-gradient) plus a legend with percentages. */
export function Donut({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  let acc = 0
  const stops =
    total === 0
      ? ['var(--color-sunk) 0% 100%']
      : segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const start = (acc / total) * 100
            acc += s.value
            const end = (acc / total) * 100
            return `var(${s.varName}) ${start}% ${end}%`
          })

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ backgroundImage: `conic-gradient(${stops.join(', ')})` }}
      >
        <div className="absolute inset-[24%] rounded-full bg-surface" />
      </div>
      <ul className="min-w-32 flex-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 py-1.5 text-base text-ink-muted">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: `var(${s.varName})` }}
              aria-hidden="true"
            />
            {s.label}
            <b className="tabular ml-auto text-ink">{total ? Math.round((s.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

type Step = { label: string; value: number }

/** Pipeline conversion as descending bars, last step in the "delivered" colour. */
export function Funnel({ steps }: { steps: Step[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <div>
      <div className="flex h-40 items-end gap-3 border-b border-line">
        {steps.map((s, i) => (
          <div key={s.label} className="flex h-full flex-1 flex-col items-center justify-end">
            <div className="tabular mb-1.5 text-sm font-bold text-ink">{s.value}</div>
            <div
              className={`w-3/4 rounded-t ${i === steps.length - 1 ? 'bg-delivered-ink' : 'bg-accent'}`}
              style={{ height: `${Math.max(2, Math.round((s.value / max) * 82))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {steps.map((s) => (
          <div key={s.label} className="flex-1 text-center text-sm text-muted">
            {s.label}
          </div>
        ))}
      </div>
    </div>
  )
}
