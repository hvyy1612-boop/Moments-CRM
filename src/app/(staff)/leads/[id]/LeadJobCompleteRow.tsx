import { CheckBox } from '../../jobs/[id]/EditableTaskRow'
import { toggleLeadJobCompleteAction } from '../actions'

export function LeadJobCompleteRow({
  csrf,
  enquiryId,
  completedLabel,
  readOnly,
}: {
  csrf: string
  enquiryId: string

  completedLabel: string | null
  readOnly: boolean
}) {
  const done = completedLabel !== null
  return (
    <section className="rounded-md border border-line-strong">
      <form action={toggleLeadJobCompleteAction} className="flex items-center gap-3 px-3 py-3">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="enquiryId" value={enquiryId} />
        <input type="hidden" name="done" value={done ? 'false' : 'true'} />
        <button
          type="submit"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? 'Untick "Job complete"' : 'Tick "Job complete"'}
          disabled={readOnly}
          data-write="lock"
          className="shrink-0 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
        >
          <CheckBox done={done} />
        </button>
        <div className="min-w-0 flex-1">
          <span className="text-base text-ink">Job complete</span>
          <span className="block text-sm text-muted">
            {done
              ? 'Done: the workflow above is closed and greyed out. Untick it to work on the lead again. The lead stays in Leads.'
              : 'The end of the job: tick it when the work is done. The lead stays in Leads.'}
          </span>
        </div>
        {completedLabel ? <span className="whitespace-nowrap text-sm text-muted">{completedLabel}</span> : null}
      </form>
    </section>
  )
}
