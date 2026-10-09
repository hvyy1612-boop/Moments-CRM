import { CheckBox } from './EditableTaskRow'

/**
 * The "Job complete" milestone that closes a job's workflow (Studio Ninja), the counterpart of "Job
 * accepted" at the top: "Job accepted" STARTS the job, "Job complete" ENDS it. The system ticks it when
 * every task is done and the job is fully paid - staff never tick it. (A lead has its own tickable row,
 * LeadJobCompleteRow, that keeps the lead in Leads.)
 */
export function JobCompleteRow({ done, dateLabel }: { done: boolean; dateLabel?: string | null }) {
  return (
    <section className="rounded-md border border-line-strong">
      <div className="flex items-center gap-3 px-3 py-3" title="Ticked by the system">
        <span className="shrink-0 p-0.5">
          <CheckBox done={done} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-base text-ink">Job complete</span>
          <span className="block text-sm text-muted">The end of the job: ticked automatically when every task is done and the job is fully paid.</span>
        </div>
        {dateLabel ? <span className="whitespace-nowrap text-sm text-muted">{dateLabel}</span> : null}
      </div>
    </section>
  )
}
