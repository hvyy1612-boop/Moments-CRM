'use client'

import { useActionState, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ClientForm, type ContactErrors } from './ClientForm'
import { createClientFormAction, type ClientFormState } from './actions'

const IDLE: ClientFormState = { status: 'idle' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateContact(fd: FormData): ContactErrors {
  const first = String(fd.get('firstName') ?? '').trim()
  const last = String(fd.get('lastName') ?? '').trim()
  const email = String(fd.get('email') ?? '').trim()
  const phone = String(fd.get('phone') ?? '').trim()
  const errors: ContactErrors = {}

  if (!first) errors.firstName = 'Please enter a first name.'
  if (!last) errors.lastName = 'Please enter a last name.'
  if (!email) errors.email = 'Please enter an email address.'
  else if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.'
  if (!phone) errors.phone = 'Please enter a phone number.'
  return errors
}

export function AddClientButton({ csrf }: { csrf: string }) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<ContactErrors>({})

  const [state, formAction] = useActionState(createClientFormAction, IDLE)

  const close = () => {
    setErrors({})
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        data-write="hide"
        onClick={() => {
          setErrors({})
          setOpen(true)
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add client
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Add a client"
        description="Record the client's contact details. Then use Add lead on their page when they enquire."
        size="lg"
        headerBorder={false}
      >
        <ClientForm
          action={formAction}
          values={state.status === 'error' ? state.values : undefined}
          formError={state.status === 'error' ? state.message : undefined}
          csrf={csrf}
          submitLabel="Save client"
          bare
          requireContact
          errors={errors}
          onSubmit={(event) => {
            const found = validateContact(new FormData(event.currentTarget))
            if (Object.keys(found).length > 0) {
              event.preventDefault()
              setErrors(found)
            } else {
              setErrors({})
            }
          }}
          footer={

            <div className="flex items-center gap-3">
              <Button type="submit" size="xl">Save client</Button>
              <Button type="button" variant="secondary" size="lg" onClick={close}>Cancel</Button>
            </div>
          }
        />
      </Modal>
    </>
  )
}
