'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { completeReset, type ResetPasswordState } from './actions'

const INITIAL: ResetPasswordState = { status: 'idle' }

export function ResetPasswordForm({ csrf, token }: { csrf: string; token: string }) {
  const [state, action, pending] = useActionState(completeReset, INITIAL)
  const [showPassword, setShowPassword] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" title={state.message}>
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new link
          </Link>
        </Alert>
      ) : null}

      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="token" value={token} />

      <Field label="New password" htmlFor="password" error={errors.password}>
        <div className="relative">
          <TextInput
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            hasError={Boolean(errors.password)}
            className="pr-16"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 rounded px-3 text-sm text-ink-muted outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          hasError={Boolean(errors.confirmPassword)}
        />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Set new password
      </Button>
    </form>
  )
}
