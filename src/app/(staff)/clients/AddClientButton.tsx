'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ClientForm, type ContactErrors } from './ClientForm'
import { createClientAction } from './actions'

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

  const close = () => {
    setErrors({})
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
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
        description="Record the client and their enquiry. This opens a lead you can work through in Leads, and becomes a job once it is booked."
        size="lg"
        headerBorder={false}
      >
        <ClientForm
          action={createClientAction}
          csrf={csrf}
          submitLabel="Save client"
          showEnquiryFields
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
