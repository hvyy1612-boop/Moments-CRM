'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Field, Select, TextInput } from '@/components/ui/form'
import {
  createInvoiceAction,
  issueInvoiceAction,
  recordPaymentAction,
  type QuoteActionState,
} from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

const INVOICE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  SENT: 'info',
  PARTIALLY_PAID: 'warn',
  PAID: 'good',
  OVERDUE: 'bad',
  VOID: 'neutral',
}

export type InvoiceView = {
  id: string
  number: string
  typeLabel: string
  status: string
  totalLabel: string
  paidLabel: string
  remainingLabel: string
  isDraft: boolean
  canPay: boolean
}

function RecordPaymentForm({
  csrf,
  projectId,
  invoiceId,
}: {
  csrf: string
  projectId: string
  invoiceId: string
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, IDLE)

  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <Select name="paymentMethod" aria-label="Payment method" defaultValue="BANK_TRANSFER">
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CARD">Card</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <div className="sm:col-span-3">
          <TextInput name="amount" aria-label="Payment amount" inputMode="decimal" placeholder="0.00" />
        </div>
        <div className="sm:col-span-3">
          <TextInput name="reference" aria-label="Reference" placeholder="Reference (optional)" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" size="sm" loading={pending} className="w-full">
            Record
          </Button>
        </div>
      </div>
    </form>
  )
}

function CreateInvoiceForm({ csrf, projectId }: { csrf: string; projectId: string }) {
  const [state, action, pending] = useActionState(createInvoiceAction, IDLE)

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Alert tone="success" title="Invoice raised" /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Invoice type" htmlFor="type">
          <Select id="type" name="type" defaultValue="DEPOSIT">
            <option value="DEPOSIT">Deposit</option>
            <option value="BALANCE">Balance</option>
            <option value="SUPPLEMENTARY">Supplementary</option>
          </Select>
        </Field>
        <Field label="Amount (incl. GST)" htmlFor="amount">
          <TextInput id="amount" name="amount" inputMode="decimal" placeholder="0.00" />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <TextInput id="description" name="description" placeholder="Booking deposit" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Raise invoice
        </Button>
      </div>
    </form>
  )
}

export function Finance({
  csrf,
  projectId,
  invoices,
}: {
  csrf: string
  projectId: string
  invoices: InvoiceView[]
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {invoices.length === 0 ? (
        <p className="text-sm text-ink-muted">No invoices yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="rounded border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-ink">
                    {invoice.number} <span className="text-ink-muted">· {invoice.typeLabel}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {invoice.paidLabel} paid of {invoice.totalLabel}
                    {invoice.canPay ? ` · ${invoice.remainingLabel} due` : ''}
                  </p>
                </div>
                <StatusPill tone={INVOICE_TONE[invoice.status] ?? 'neutral'}>
                  {invoice.status.toLowerCase().replace(/_/g, ' ')}
                </StatusPill>
              </div>

              {invoice.isDraft ? (
                <form action={issueInvoiceAction} className="mt-3 border-t border-line pt-3">
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Issue invoice
                  </Button>
                </form>
              ) : invoice.canPay ? (
                <RecordPaymentForm csrf={csrf} projectId={projectId} invoiceId={invoice.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <CreateInvoiceForm csrf={csrf} projectId={projectId} />
    </div>
  )
}
