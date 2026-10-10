'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { IconButton, IconLink } from '@/components/ui/IconButton'
import { Field, Textarea, TextInput } from '@/components/ui/form'
import { Modal, modalBody } from '@/components/ui/Modal'
import { sendInvoiceAction, type SendInvoiceState } from '../actions'
import { deleteInvoiceAction, voidInvoiceAction } from '../../jobs/actions'

const IDLE: SendInvoiceState = { status: 'idle' }

const PRIMARY_BTN = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3.5 text-sm font-medium text-surface transition-opacity hover:opacity-90'
const icon = { viewBox: '0 0 24 24', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export function InvoiceHeaderActions(props: {
  csrf: string
  invoiceId: string
  projectId: string
  invoiceNumber: string
  status: string

  everSent: boolean
  clientName: string
  clientEmail: string
  clientViewHref: string | null
  editHref: string | null
  canVoid: boolean
  canDelete: boolean
}) {
  const { csrf, invoiceId, projectId, invoiceNumber, status, everSent, clientName, clientEmail, editHref, canVoid, canDelete } = props
  const [sendOpen, setSendOpen] = useState(false)
  const sendPrimary = status === 'DRAFT' || status === 'ISSUED'

  const showResend = !sendPrimary && status !== 'VOID'

  const hidden = (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="projectId" value={projectId} />
    </>
  )

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {sendPrimary ? (
        <button type="button" onClick={() => setSendOpen(true)} className={PRIMARY_BTN}>
          <svg {...icon}><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>
          Send invoice
        </button>
      ) : null}
      {showResend ? (
        <IconButton
          label={everSent ? 'Resend invoice' : 'Send invoice'}
          onClick={() => setSendOpen(true)}
          icon={<svg {...icon}><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>}
        />
      ) : null}
      {editHref ? (
        <IconLink
          label="Edit"
          tone="accent"
          href={editHref}
          icon={<svg {...icon}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>}
        />
      ) : null}
      <IconButton
        label="Download"
        onClick={() => window.print()}
        icon={<svg {...icon}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>}
      />
      {canVoid ? (
        <form action={voidInvoiceAction} onSubmit={(e) => { if (!window.confirm('Mark this invoice as uncollectible? It stays on record but is written off as a debt that will not be recovered.')) e.preventDefault() }}>
          {hidden}
          <IconButton
            type="submit"
            label="Mark uncollectible"
            tone="warn"
            icon={<svg {...icon}><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></svg>}
          />
        </form>
      ) : null}
      {canDelete ? (
        <form action={deleteInvoiceAction} onSubmit={(e) => { if (!window.confirm('Delete this invoice permanently? This cannot be undone.')) e.preventDefault() }}>
          {hidden}
          <input type="hidden" name="back" value="/finance" />
          <IconButton
            type="submit"
            label="Delete invoice"
            tone="danger"
            icon={<svg {...icon}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" /></svg>}
          />
        </form>
      ) : null}

      <SendInvoiceDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        csrf={csrf}
        invoiceId={invoiceId}
        projectId={projectId}
        invoiceNumber={invoiceNumber}
        clientName={clientName}
        clientEmail={clientEmail}
        resend={everSent}
      />
    </div>
  )
}

function SendInvoiceDialog({
  open,
  onClose,
  csrf,
  invoiceId,
  projectId,
  invoiceNumber,
  clientName,
  clientEmail,
  resend,
}: {
  open: boolean
  onClose: () => void
  csrf: string
  invoiceId: string
  projectId: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  resend: boolean
}) {
  const [state, send, sending] = useActionState(sendInvoiceAction, IDLE)

  const typed = state.status === 'idle' ? undefined : state.values
  const defaultSubject = `Invoice ${invoiceNumber} from Moments Photography & Film`
  const defaultMessage =
    `Dear ${clientName},\n\n` +
    `Thank you for choosing Moments Photography & Film.\n\n` +
    `Please find your invoice ${invoiceNumber} at the link below. It shows the amount due, the payment schedule and how to pay.\n\n` +
    `If you have any questions about this invoice, please reply to this email.\n\n` +
    `Kind regards,\n\nMoments Photography & Film`

  return (
    <Modal open={open} onClose={onClose} title={resend ? 'Resend invoice' : 'Send invoice'} size="sm">
      <form action={send} className="flex min-h-0 flex-1 flex-col">
        <div className={modalBody}>
          {state.status === 'error' || state.status === 'notice' ? <Alert tone={state.status === 'error' ? 'danger' : 'info'} title={state.message} /> : null}
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="To" htmlFor="si-to" hint="The client's email address.">
            <TextInput id="si-to" name="to" type="email" defaultValue={typed?.to ?? clientEmail} required placeholder="client@example.com" />
          </Field>
          <Field label="Subject" htmlFor="si-subject">
            <TextInput id="si-subject" name="subject" defaultValue={typed?.subject ?? defaultSubject} maxLength={200} />
          </Field>
          <Field label="Message" htmlFor="si-message" hint="A 'View invoice' link is added automatically.">
            <Textarea id="si-message" name="message" rows={8} defaultValue={typed?.message ?? defaultMessage} maxLength={4000} />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" loading={sending}>{resend ? 'Resend invoice' : 'Send invoice'}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
