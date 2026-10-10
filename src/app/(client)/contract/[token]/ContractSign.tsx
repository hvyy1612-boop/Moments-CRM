'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { signContract, type SignState } from './actions'

const IDLE: SignState = { status: 'idle' }

export function ContractSign({ csrf, token }: { csrf: string; token: string }) {
  const [state, action, pending] = useActionState(signContract, IDLE)

  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Thank you, your contract is signed">
        Your date is secured once the deposit is paid. We will be in touch with the next steps.
      </Alert>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="token" value={token} />
      <Field label="Type your full name to sign" htmlFor="signedName">
        <TextInput id="signedName" name="signedName" autoComplete="name" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Sign contract
        </Button>
      </div>
    </form>
  )
}
