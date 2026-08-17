'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { signIn, type LoginFormState } from './actions'

const INITIAL: LoginFormState = { status: 'idle' }

export function LoginForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(signIn, INITIAL)
  const [showPassword, setShowPassword] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" title={state.message} />
      ) : null}

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

      <Field label="Password" htmlFor="password" error={errors.password}>
        <div className="relative">
          <TextInput
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            hasError={Boolean(errors.password)}
            className="pr-16"
          />
          {/* §8.5: show/hide toggle, keyboard reachable and labelled for screen readers. */}
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

      <div className="flex items-center justify-between gap-4">
        {/* BR-G10: opt-in, never pre-ticked. Extends only the absolute session lifetime. */}
        <label htmlFor="remember" className="flex items-center gap-2 text-sm text-ink">
          <input id="remember" name="remember" type="checkbox" className="h-4 w-4 accent-accent" />
          Stay signed in for 7 days
        </label>
      </div>

      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  )
}
