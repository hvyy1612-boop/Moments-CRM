'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/form'
import { addEnquiryAction, type AddEnquiryState } from './actions'
import { ClientContactPicker } from './ClientContactPicker'

const INITIAL: AddEnquiryState = { status: 'idle' }

type ClientErrors = { name?: string; email?: string; contact?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Same required-field checks the server runs, done in the browser so staff see the red line the
 * moment they submit a blank starred field (Google/Facebook style) instead of a native tooltip. */
function validateContact(fd: FormData): ClientErrors {
  // An existing client was picked - nothing else to fill in.
  if (String(fd.get('clientId') ?? '').trim()) return {}
  // Search mode with nothing chosen: the new-client fields are not even on screen.
  if (!fd.has('name')) {
    return { contact: 'Add a client for this enquiry. Search for an existing one, or fill in the new client details.' }
  }
  const name = String(fd.get('name') ?? '').trim()
  const email = String(fd.get('email') ?? '').trim()
  const errs: ClientErrors = {}
  if (!name) errs.name = "Please enter the client's name."
  if (!email) errs.email = 'Please enter an email address.'
  else if (!EMAIL_RE.test(email)) errs.email = 'Please enter a valid email address.'
  return errs
}

/** "Add enquiry" opens a compact sheet that creates a REAL Enquiry (a lead) and opens it. */
export function AddEnquiryButton({ csrf }: { csrf: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(addEnquiryAction, INITIAL)
  const [clientErrors, setClientErrors] = useState<ClientErrors>({})
  const serverErrors = state.status === 'error' ? (state.errors ?? {}) : {}
  // Client-side check wins while it stands; the server's answer fills in once the form actually posts.
  const errors = {
    name: clientErrors.name ?? serverErrors.name,
    email: clientErrors.email ?? serverErrors.email,
  }
  const topMessage = clientErrors.contact ?? (state.status === 'error' ? state.message : undefined)

  useEffect(() => {
    if (state.status === 'created') router.push(`/enquiries/${state.enquiryId}`)
  }, [state, router])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setClientErrors({})
          setOpen(true)
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Add enquiry
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add enquiry"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add enquiry</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            {topMessage ? <div className="mb-3"><Alert tone="danger" title={topMessage} /></div> : null}

            <form
              action={action}
              noValidate
              onSubmit={(e) => {
                const found = validateContact(new FormData(e.currentTarget))
                // Block the post and show the red lines when a starred field is empty or wrong.
                if (found.name || found.email || found.contact) {
                  e.preventDefault()
                  setClientErrors(found)
                } else {
                  setClientErrors({})
                }
              }}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="csrf" value={csrf} />
              <ClientContactPicker
                errors={errors}
                onFieldInput={(field) => setClientErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))}
              />
              <Field label="Event type" htmlFor="enq-type">
                <TextInput id="enq-type" name="eventType" placeholder="Wedding, Events, Portrait" autoComplete="off" />
              </Field>
              <Field label="Note / first message" htmlFor="enq-note">
                <Textarea id="enq-note" name="message" rows={3} />
              </Field>
              <div className="mt-1 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={pending}>Add enquiry</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
