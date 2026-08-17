'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { acceptQuote, type AcceptState } from './actions'

const IDLE: AcceptState = { status: 'idle' }

export function QuoteAccept({ csrf, token }: { csrf: string; token: string }) {
  const [state, action, pending] = useActionState(acceptQuote, IDLE)

  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Thank you, your quote is accepted">
        We will be in touch with the next steps.
      </Alert>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="token" value={token} />
      <Field label="Type your name to accept" htmlFor="acceptedName">
        <TextInput id="acceptedName" name="acceptedName" autoComplete="name" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Accept quote
        </Button>
      </div>
    </form>
  )
}
