'use client'

import Link from 'next/link'

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
import { CopyLinkField } from '@/components/ui/CopyLinkField'

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

export type InvoiceInstalmentView = {
  id: string
  label: string | null
  dueLabel: string | null
  amountLabel: string
  status: string
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
  poNumber: string | null
  notes: string | null
  accessToken: string | null
  instalments: InvoiceInstalmentView[]
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

              {invoice.poNumber ? <p className="mt-1 text-xs text-ink-muted">PO: {invoice.poNumber}</p> : null}

              {invoice.instalments.length > 1 ? (
                <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                  {invoice.instalments.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink-muted">{it.label ?? 'Instalment'}{it.dueLabel ? ` · due ${it.dueLabel}` : ''}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular text-ink">{it.amountLabel}</span>
                        <StatusPill tone={it.status === 'PAID' ? 'good' : 'neutral'}>{it.status.toLowerCase()}</StatusPill>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {invoice.notes ? <p className="mt-2 whitespace-pre-line border-t border-line pt-2 text-sm text-ink-muted">{invoice.notes}</p> : null}

              <div className="mt-2">
                <Link href={`/jobs/${projectId}/invoice/${invoice.id}`} target="_blank" className="text-sm font-bold text-accent hover:underline">
                  View / PDF -&gt;
                </Link>
              </div>
              {invoice.accessToken ? (
                <div className="mt-2">
                  <p className="text-xs text-ink-muted">Client link</p>
                  <CopyLinkField path={`/invoice/${invoice.accessToken}`} />
                </div>
              ) : null}

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

      <Link href={`/finance/new?job=${projectId}`} className="inline-block">
        <Button size="sm">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New invoice
        </Button>
      </Link>
    </div>
  )
}
