'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ClientForm } from './ClientForm'
import { createClientAction } from './actions'

/**
 * "Add client" opens the intake in a Modal instead of navigating to /clients/new - the studio adds a
 * client (and its opening enquiry) without leaving the list. The form is the shared ClientForm in its
 * `bare` layout; on success createClientAction redirects to the new enquiry, which unmounts the modal
 * on its own, so there is no manual close-on-submit (the modal only closes here via Cancel / Escape / x).
 */
export function AddClientButton({ csrf }: { csrf: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add client
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a client"
        description="Record the client and their enquiry. This opens a lead in Enquiries you can work through, and becomes a job once you convert it."
        size="lg"
      >
        <ClientForm
          action={createClientAction}
          csrf={csrf}
          submitLabel="Add client"
          showEnquiryFields
          bare
          footer={
            <div className="flex gap-3">
              <Button type="submit">Add client</Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          }
        />
      </Modal>
    </>
  )
}
