'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { Modal, ModalFooter, modalBody, modalCancelBtn, modalPrimaryBtn } from '@/components/ui/Modal'
import { moveJobBackToLeadAction } from '../actions'
import { CheckBox } from './EditableTaskRow'

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={modalPrimaryBtn} disabled={pending}>
      {pending ? 'Moving back...' : 'Yes, untick "Job accepted"'}
    </button>
  )
}

/**
 * The "Job accepted" milestone at the top of the job workflow (Studio Ninja style). It is ticked by the
 * system - when the deposit is paid, or when the job was added as already confirmed. Unticking it asks
 * first, then turns the job back into a lead (Awaiting booking confirmation). It cannot be unticked once
 * money is recorded or the job is delivered/closed; `blocker` says why.
 */
export function JobAcceptedRow({
  csrf,
  projectId,
  acceptedLabel,
  blocker,
}: {
  csrf: string
  projectId: string
  acceptedLabel: string | null
  blocker: string | null
}) {
  const [confirming, setConfirming] = useState(false)
  const moveError = useSearchParams().get('moveError')

  return (
    <section className="rounded-md border border-line-strong">
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          role="checkbox"
          aria-checked="true"
          aria-label='Untick "Job accepted"'
          title={blocker ?? 'Untick to move this job back to Leads'}
          disabled={blocker !== null}
          data-write="lock"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
        >
          <CheckBox done />
        </button>
        <div className="min-w-0 flex-1">
          <span className="text-base text-ink">Job accepted</span>
          <span className="block text-sm text-muted">The start of the job: ticked when the 20% deposit is received, when Job accepted is ticked on the lead, or when the job is added as already confirmed.</span>
        </div>
        {acceptedLabel ? <span className="whitespace-nowrap text-sm text-muted">{acceptedLabel}</span> : null}
      </div>
      {blocker || moveError ? (
        <p className={`border-t border-line px-3 py-2 text-sm ${moveError ? 'text-danger' : 'text-muted'}`}>{moveError ?? blocker}</p>
      ) : null}

      <Modal open={confirming} onClose={() => setConfirming(false)} title='Untick "Job accepted"?' size="sm">
        <div className={modalBody}>
          <p className="text-base text-ink">
            Once &quot;Job accepted&quot; is unticked, this job becomes a lead again. It moves from Jobs back to Leads, where it
            waits for its deposit.
          </p>
        </div>
        <form action={moveJobBackToLeadAction}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="projectId" value={projectId} />
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
