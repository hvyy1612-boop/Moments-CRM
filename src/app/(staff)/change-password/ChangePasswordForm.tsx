'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { changePassword, type ChangePasswordState } from './actions'

const INITIAL: ChangePasswordState = { status: 'idle' }

export function ChangePasswordForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(changePassword, INITIAL)
  const [show, setShow] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <input type="hidden" name="csrf" value={csrf} />

      <Field label="New password" htmlFor="password" hint="At least 12 characters." error={errors.password}>
        <div className="relative">
          <TextInput
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            hasError={Boolean(errors.password)}
            className="pr-16"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 rounded px-3 text-sm text-ink-muted outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm}>
        <TextInput
          id="confirm"
          name="confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          hasError={Boolean(errors.confirm)}
        />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Save and continue
      </Button>
    </form>
  )
}
