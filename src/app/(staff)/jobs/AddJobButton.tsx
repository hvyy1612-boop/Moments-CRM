'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/form'
import { createStaffEnquiryAction, type StaffEnquiryState } from './actions'

const INITIAL: StaffEnquiryState = { status: 'idle' }

/** "Add job" opens a compact sheet that creates the job (client + project) and lands on it. Job-only:
 *  no separate "new client" / "new enquiry" entry points. */
export function AddJobButton({ csrf }: { csrf: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createStaffEnquiryAction, INITIAL)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Add job
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add job"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add job</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            {state.status === 'error' && state.message ? <div className="mb-3"><Alert tone="danger" title={state.message} /></div> : null}

            <form action={action} className="flex flex-col gap-4">
              <input type="hidden" name="csrf" value={csrf} />
              <Field label="Client name" htmlFor="job-name" error={errors.name}>
                <TextInput id="job-name" name="name" autoFocus autoComplete="off" hasError={Boolean(errors.name)} />
              </Field>
              <Field label="Client email" htmlFor="job-email" error={errors.email}>
                <TextInput id="job-email" name="email" type="email" autoComplete="off" hasError={Boolean(errors.email)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Phone" htmlFor="job-phone" error={errors.phone}>
                  <TextInput id="job-phone" name="phone" autoComplete="off" hasError={Boolean(errors.phone)} />
                </Field>
                <Field label="Job type" htmlFor="job-type">
                  <TextInput id="job-type" name="eventType" placeholder="Wedding, Events, Portrait" autoComplete="off" />
                </Field>
              </div>
              <Field label="Note" htmlFor="job-note" error={errors.message}>
                <Textarea id="job-note" name="message" rows={3} />
              </Field>
              <div className="mt-1 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={pending}>Add job</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
