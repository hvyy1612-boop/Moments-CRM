'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/form'
import { Modal, modalBody } from '@/components/ui/Modal'
import { PrintButton } from '@/components/PrintButton'
import { sendInvoiceAction, type SendInvoiceState } from '../actions'
import { InvoiceMoreMenu } from './InvoiceMoreMenu'

const IDLE: SendInvoiceState = { status: 'idle' }

// One obvious primary (ink), quiet bordered secondaries - the same header buttons as the Clients detail page.
const PRIMARY_BTN = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3.5 text-sm font-medium text-surface transition-opacity hover:opacity-90'
const QUIET_BTN =
  'inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk'
const icon = { viewBox: '0 0 24 24', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

/**
 * Invoice header actions, in one row: Send invoice (the primary while the invoice has not been emailed),
 * Client view, Edit, Download, and a "..." menu for the rarer / destructive actions. Once sent, sending
 * again moves into the menu (Resend) so a single primary action remains on the page.
 */
export function InvoiceHeaderActions(props: {
  csrf: string
  invoiceId: string
  projectId: string
  invoiceNumber: string
  status: string
  /** True once an email to the client was actually delivered (an `invoice.sent` event exists). */
  everSent: boolean
  clientName: string
  clientEmail: string
  clientViewHref: string | null
  editHref: string | null
  canVoid: boolean
  canDelete: boolean
}) {
  const { csrf, invoiceId, projectId, invoiceNumber, status, everSent, clientName, clientEmail, clientViewHref, editHref, canVoid, canDelete } = props
  const [sendOpen, setSendOpen] = useState(false)
  const sendPrimary = status === 'DRAFT' || status === 'ISSUED'
  // Once money moves the primary action is the payment, so (re)sending lives in the "..." menu.
  const menuSend = !sendPrimary && status !== 'VOID'

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {sendPrimary ? (
        <button type="button" onClick={() => setSendOpen(true)} className={PRIMARY_BTN}>
          <svg {...icon}><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>
          Send invoice
        </button>
      ) : null}
      {clientViewHref ? (
        <Link href={clientViewHref} target="_blank" className={QUIET_BTN}>
          <svg {...icon}><path d="M14 4h6v6M20 4l-8 8M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>
          Client view
        </Link>
      ) : null}
      {editHref ? (
        <Link href={editHref} className={QUIET_BTN}>
          <svg {...icon}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
          Edit
        </Link>
      ) : null}
      <PrintButton
        label="Download"
        className={QUIET_BTN}
        icon={<svg {...icon}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>}
      />
      <InvoiceMoreMenu
        csrf={csrf}
        invoiceId={invoiceId}
        projectId={projectId}
        isDraft={status === 'DRAFT'}
        canVoid={canVoid}
        canDelete={canDelete}
        onSend={menuSend ? () => setSendOpen(true) : undefined}
        sendLabel={everSent ? 'Resend invoice' : 'Send invoice'}
      />

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

/**
 * Compose-and-send (same pattern as Send quote): the recipient and a Moments covering note are prefilled
 * and stay editable; the server adds the "View invoice" link. A draft is issued as part of sending.
 */
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
            <TextInput id="si-to" name="to" type="email" defaultValue={clientEmail} required placeholder="client@example.com" />
          </Field>
          <Field label="Subject" htmlFor="si-subject">
            <TextInput id="si-subject" name="subject" defaultValue={defaultSubject} maxLength={200} />
          </Field>
          <Field label="Message" htmlFor="si-message" hint="A 'View invoice' link is added automatically.">
            <Textarea id="si-message" name="message" rows={8} defaultValue={defaultMessage} maxLength={4000} />
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
