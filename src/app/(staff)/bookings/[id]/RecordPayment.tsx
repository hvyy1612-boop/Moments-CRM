'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/form'
import { recordPaymentAction, type BookingActionState } from './actions'

const INITIAL: BookingActionState = { status: 'idle' }

export function RecordPayment({
  invoices,
  csrf,
}: {
  invoices: { id: string; label: string; outstanding: string }[]
  csrf: string
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, INITIAL)
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? '')

  if (invoices.length === 0) {
    return <p className="text-sm text-ink-muted">Everything on this booking is paid.</p>
  }

  const chosen = invoices.find((invoice) => invoice.id === invoiceId)

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Invoice" htmlFor="invoiceId">
        <Select
          id="invoiceId"
          name="invoiceId"
          value={invoiceId}
          onChange={(event) => setInvoiceId(event.target.value)}
        >
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Amount received"
        htmlFor="amount"
        hint={chosen ? `Outstanding ${chosen.outstanding}` : undefined}
      >
        <TextInput
          id="amount"
          name="amount"
          inputMode="decimal"
          defaultValue={chosen?.outstanding}
          placeholder="1570.00"
        />
      </Field>

      <Field label="How it was paid" htmlFor="method">
        <Select id="method" name="method" defaultValue="BANK_TRANSFER">
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CASH">Cash</option>
          <option value="CARD">Card, taken elsewhere</option>
          <option value="OTHER">Other</option>
        </Select>
      </Field>

      <Field label="Reference" htmlFor="reference" hint="Optional. The bank reference helps later.">
        <TextInput id="reference" name="reference" />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Record the payment
      </Button>
    </form>
  )
}
