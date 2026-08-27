
export function WorkflowProgress({
  done,
  total,
  nowLabel,
  nextTitle,
}: {
  done: number
  total: number
  nowLabel: string | null
  nextTitle: string | null
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const complete = total > 0 && done === total

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Workflow progress</span>
        <span className="text-sm font-bold text-ink">
          {done} of {total} done · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sunk">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2.5 text-sm text-ink-muted">
        {complete ? (
          <span className="font-bold text-delivered-ink">All tasks complete</span>
        ) : (
          <>
            {nowLabel ? (
              <>
                Now: <span className="font-bold text-ink">{nowLabel}</span>
              </>
            ) : null}
            {nextTitle ? (
              <>
                {nowLabel ? ' · ' : ''}Next: <span className="font-bold text-ink">{nextTitle}</span>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
