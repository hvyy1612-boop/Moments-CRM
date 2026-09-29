'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/form'
import { Modal, modalBody } from '@/components/ui/Modal'
import { recordPaymentAction, type QuoteActionState } from '../../jobs/actions'

const IDLE: QuoteActionState = { status: 'idle' }

/**
 * "Record payment" - a contextual action on the payment schedule (only while money is still owed), opening
 * the existing record-payment flow in a dialog instead of a card that permanently takes up space.
 */
export function RecordPaymentDialog({
  csrf,
  projectId,
  invoiceId,
  balance,
  balanceLabel,
  primary,
}: {
  csrf: string
  projectId: string
  invoiceId: string
  /** Remaining balance as a plain amount (prefills the field). */
  balance: string
  balanceLabel: string
  primary: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(recordPaymentAction, IDLE)
  // Close only once the action has succeeded (closing from the submit click would unmount the form first).
  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <>
      <Button type="button" size="sm" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>
        Record payment
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record payment" description={`Balance due ${balanceLabel}`} size="xs">
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <Field label="Amount" htmlFor="rp-amount">
              <TextInput id="rp-amount" name="amount" inputMode="decimal" defaultValue={balance} placeholder="0.00" required />
            </Field>
            <Field label="Payment method" htmlFor="rp-method">
              <Select id="rp-method" name="paymentMethod" defaultValue="BANK_TRANSFER">
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Reference (optional)" htmlFor="rp-ref">
              <TextInput id="rp-ref" name="reference" maxLength={140} placeholder="e.g. bank transfer reference" />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" loading={pending}>Record payment</Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}
