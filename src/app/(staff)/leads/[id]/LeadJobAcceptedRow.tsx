'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { Modal, ModalFooter, modalBody, modalCancelBtn, modalPrimaryBtn } from '@/components/ui/Modal'
import { CheckBox } from '../../jobs/[id]/EditableTaskRow'
import { acceptLeadAsJobAction } from '../actions'

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={modalPrimaryBtn} disabled={pending}>
      {pending ? 'Moving to Jobs...' : 'Mark as "Job accepted"'}
    </button>
  )
}

export function LeadJobAcceptedRow({
  csrf,
  enquiryId,
  jobId,
  readOnly,
  muted = false,
}: {
  csrf: string
  enquiryId: string

  jobId: string | null

  readOnly: boolean

  muted?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const acceptError = useSearchParams().get('acceptError')
  const booked = jobId !== null

  return (
    <section className={`rounded-md border border-line-strong ${muted ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={booked}
          aria-label='Tick "Job accepted"'
          title={booked ? 'This lead is a job' : muted ? 'Untick Job complete first' : readOnly ? 'Restore this lead first' : 'Tick when the client has confirmed the booking'}
          disabled={booked || readOnly}
          data-write="lock"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
        >
          <CheckBox done={booked} />
        </button>
        <div className="min-w-0 flex-1">
          <span className="text-base text-ink">Job accepted</span>
          <span className="block text-sm text-muted">
            The start of the job: ticks itself when the 20% deposit is received. Tick it when the client has confirmed, and the lead becomes a job.
          </span>
        </div>
        {booked ? (
          <Link href={`/jobs/${jobId}`} className="whitespace-nowrap text-sm font-bold text-accent-ink hover:underline">
            Open the job
          </Link>
        ) : null}
      </div>
      {acceptError ? <p className="border-t border-line px-3 py-2 text-sm text-danger">{acceptError}</p> : null}

      <Modal open={confirming} onClose={() => setConfirming(false)} title='Mark as "Job accepted"?' size="sm">
        <div className={modalBody}>
          <p className="text-base text-ink">
            This turns the lead into a job and moves it to Jobs. No payment is recorded: raise the deposit invoice on
            the job.
          </p>
        </div>
        <form action={acceptLeadAsJobAction}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
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
