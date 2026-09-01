'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Select, TextInput } from '@/components/ui/form'
import {
  issueInvoiceAction,
  recordPaymentAction,
  type QuoteActionState,
} from '../actions'
import { InvoiceEditor, type PackageOption } from './InvoiceEditor'

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

export function Finance({
  csrf,
  projectId,
  invoices,
  packages,
}: {
  csrf: string
  projectId: string
  invoices: InvoiceView[]
  packages: PackageOption[]
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

      <InvoiceEditor csrf={csrf} projectId={projectId} packages={packages} />
    </div>
  )
}
