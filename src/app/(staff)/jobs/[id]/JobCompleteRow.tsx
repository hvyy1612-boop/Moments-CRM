'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { Modal, ModalFooter, modalBody, modalCancelBtn, modalPrimaryBtn } from '@/components/ui/Modal'
import { setJobCompleteAction } from '../actions'
import { CheckBox } from './EditableTaskRow'

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={modalPrimaryBtn} disabled={pending}>
      {pending ? 'Completing...' : 'Mark as "Job complete"'}
    </button>
  )
}

export function JobCompleteRow({
  csrf,
  projectId,
  done,
  dateLabel,
  readOnly,
  openTasks,
  outstandingLabel,
}: {
  csrf: string
  projectId: string
  done: boolean
  dateLabel: string | null
  readOnly: boolean

  openTasks: number

  outstandingLabel: string | null
}) {
  const [confirming, setConfirming] = useState(false)
  const completeError = useSearchParams().get('completeError')

  useEffect(() => {
    if (done) setConfirming(false)
  }, [done])
  const warnings = [
    openTasks > 0 ? `${openTasks} task${openTasks === 1 ? ' is' : 's are'} still open.` : null,
    outstandingLabel ? `${outstandingLabel} is still to be paid.` : null,
  ].filter(Boolean) as string[]

  return (
    <section className="rounded-md border border-line-strong">
      <div className="flex items-center gap-3 px-3 py-3">
        {done ? (

          <form action={setJobCompleteAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="done" value="false" />
            <button
              type="submit"
              role="checkbox"
              aria-checked="true"
              aria-label='Untick "Job complete"'
              title={readOnly ? 'A closed job cannot change' : 'Untick to move the job back to Active Jobs'}
              disabled={readOnly}
              data-write="lock"
              className="shrink-0 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
            >
              <CheckBox done />
            </button>
          </form>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked="false"
            aria-label='Tick "Job complete"'
            title={readOnly ? 'This job cannot change' : 'Tick when the job is finished'}
            disabled={readOnly}
            data-write="lock"
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
          >
            <CheckBox done={false} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-base text-ink">Job complete</span>
          <span className="block text-sm text-muted">
            The end of the job: tick it when the work is finished and the job moves to Completed Jobs. It also ticks itself
            once every task is done, Final payment received included.
          </span>
        </div>
        {dateLabel ? <span className="whitespace-nowrap text-sm text-muted">{dateLabel}</span> : null}
      </div>
      {completeError ? <p className="border-t border-line px-3 py-2 text-sm text-danger">{completeError}</p> : null}

      <Modal open={confirming} onClose={() => setConfirming(false)} title='Mark as "Job complete"?' size="sm">
        <div className={modalBody}>
          <p className="text-base text-ink">This moves the job from Active Jobs to Completed Jobs. You can untick it to bring it back.</p>
          {warnings.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-ink-muted">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <form action={setJobCompleteAction}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="done" value="true" />
          <ModalFooter>
            <button type="button" className={modalCancelBtn} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <ConfirmButton />
          </ModalFooter>
        </form>
      </Modal>
    </section>
  )
}
