'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { decide, type DecisionState } from './actions'

const INITIAL: DecisionState = { status: 'idle' }

/**
 * One decision, two buttons (§10.4).
 *
 * BR-P15: the Accept control stays disabled until the acknowledgement box is ticked. The tick and
 * the typed name are what the Agreement records as the signature (BR-AG03).
 */
export function QuoteDecision({
  acceptToken,
  declineToken,
  viewToken,
}: {
  acceptToken: string
  declineToken: string
  viewToken: string
}) {
  const [state, action, pending] = useActionState(decide, INITIAL)
  const [acknowledged, setAcknowledged] = useState(false)
  const [name, setName] = useState('')

  if (state.status === 'error') {
    return (
      <Alert tone="danger" title={state.message}>
        Reload this page to try again.
      </Alert>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="acceptToken" value={acceptToken} />
      <input type="hidden" name="declineToken" value={declineToken} />
      <input type="hidden" name="viewToken" value={viewToken} />

      <div>
        <h2 className="text-lg">Ready to book?</h2>
        <p className="mt-1 max-w-prose text-base text-ink-muted">
          Accepting holds your date. The studio will then send the booking fee invoice, and the date
          is confirmed once that is paid.
        </p>
      </div>

      <Field label="Your full name" htmlFor="acceptedName" hint="This is recorded with your acceptance.">
        <TextInput
          id="acceptedName"
          name="acceptedName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
        />
      </Field>

      <label htmlFor="acknowledged" className="flex items-start gap-3 text-base text-ink">
        <input
          id="acknowledged"
          name="acknowledged"
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-1 h-4 w-4 accent-accent"
        />
        <span>
          I have read the booking terms above, including that the booking fee is not refundable.
        </span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="submit"
          name="intent"
          value="accept"
          loading={pending}
          // BR-P15: disabled until the terms are acknowledged, and a name is needed for the record.
          disabled={!acknowledged || name.trim().length === 0}
          className="flex-1"
        >
          Accept and hold my date
        </Button>
        <Button type="submit" name="intent" value="decline" variant="secondary" className="flex-1">
          This is not for us
        </Button>
      </div>
      {!acknowledged ? (
        <p className="text-sm text-ink-muted">
          Tick the box above to accept. You can decline without ticking it.
        </p>
      ) : null}
    </form>
  )
}
