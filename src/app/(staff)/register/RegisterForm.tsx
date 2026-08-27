'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { register, type RegisterFormState } from './actions'

const INITIAL: RegisterFormState = { status: 'idle' }

export function RegisterForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(register, INITIAL)
  const [showPassword, setShowPassword] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Name" htmlFor="name" error={errors.name}>
        <TextInput id="name" name="name" autoComplete="name" autoFocus hasError={Boolean(errors.name)} />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email}>
        <TextInput id="email" name="email" type="email" autoComplete="email" hasError={Boolean(errors.email)} />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 12 characters." error={errors.password}>
        <div className="relative">
          <TextInput
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            hasError={Boolean(errors.password)}
            className="pr-16"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 rounded px-3 text-sm text-ink-muted outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Create account
      </Button>
    </form>
  )
}
