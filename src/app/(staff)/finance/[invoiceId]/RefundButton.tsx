'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/form'
import { refundPaymentAction, type QuoteActionState } from '../../jobs/actions'

const IDLE: QuoteActionState = { status: 'idle' }

/** Refund all or part of one payment. Reveals a small inline form; the backend caps the amount. */
export function RefundButton({
  csrf,
  paymentId,
  invoiceId,
  refundable,
}: {
  csrf: string
  paymentId: string
  invoiceId: string
  refundable: string
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(refundable)
  const [reason, setReason] = useState('')
  const [state, action, pending] = useActionState(refundPaymentAction, IDLE)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-bold text-accent hover:underline">
        Refund
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-line bg-paper p-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-ink-muted">Amount
          <TextInput name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-28" />
        </label>
        <label className="flex flex-1 flex-col text-xs text-ink-muted">Reason (optional)
          <TextInput name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. deposit returned" className="mt-1" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          loading={pending}
          onClick={(e) => { if (!window.confirm(`Refund $${amount}? This reverses it on the invoice.`)) e.preventDefault() }}
        >
          Refund
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
