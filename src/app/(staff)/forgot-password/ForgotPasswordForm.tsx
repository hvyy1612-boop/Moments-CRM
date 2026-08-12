'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { requestReset, type ForgotPasswordState } from './actions'

const INITIAL: ForgotPasswordState = { status: 'idle' }

export function ForgotPasswordForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(requestReset, INITIAL)

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="success" title="Check your email">
          If that email matches an account, a reset link has been sent. It works once and expires
          in 15 minutes.
        </Alert>
        <Link
          href="/login"
          className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Email" htmlFor="email" error={errors.email}>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          hasError={Boolean(errors.email)}
        />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Send reset link
      </Button>

      <Link
        href="/login"
        className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
      >
        Back to sign in
      </Link>
    </form>
  )
}
