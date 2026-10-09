import { CheckBox } from './EditableTaskRow'

/**
 * The "Job complete" milestone that closes a job's workflow (Studio Ninja), the counterpart of "Job
 * accepted" at the top: "Job accepted" STARTS the job, "Job complete" ENDS it. The system ticks it when
 * every task is done and the job is fully paid - staff never tick it. On a lead it shows greyed out, so
 * staff see where it sits without being able to use it there.
 */
export function JobCompleteRow({ done, dateLabel, onLead = false }: { done: boolean; dateLabel?: string | null; onLead?: boolean }) {
  return (
    <section className={`rounded-md border ${onLead ? 'border-line bg-paper' : 'border-line-strong'}`}>
      <div className="flex items-center gap-3 px-3 py-3" title="Ticked by the system">
        <span className="shrink-0 p-0.5">
          <CheckBox done={done} muted={onLead} />
        </span>
        <div className="min-w-0 flex-1">
          <span className={`text-base ${onLead ? 'text-ink-muted' : 'text-ink'}`}>Job complete</span>
          <span className="block text-sm text-muted">
            {onLead
              ? 'The end of the job, ticked on the job page once the work is delivered and fully paid. Nothing to do here while it is a lead.'
              : 'The end of the job: ticked automatically when every task is done and the job is fully paid.'}
          </span>
        </div>
        {dateLabel ? <span className="whitespace-nowrap text-sm text-muted">{dateLabel}</span> : null}
      </div>
    </section>
  )
}
