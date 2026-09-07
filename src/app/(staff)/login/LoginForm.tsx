'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { signIn, type LoginFormState } from './actions'

const INITIAL: LoginFormState = { status: 'idle' }

export function LoginForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(signIn, INITIAL)
  const [showPassword, setShowPassword] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <input type="hidden" name="csrf" value={csrf} />

      {/* Intentional rhythm between fields (gap-5), matching the reference spacing. */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-ink">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            className={`auth-input${errors.email ? ' has-error' : ''}`}
          />
          {errors.email ? <p className="text-sm text-lost-ink">{errors.email}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={`auth-input pw${errors.password ? ' has-error' : ''}`}
            />
            {/* Show/hide toggle, keyboard reachable and labelled for screen readers. */}
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center rounded px-3 text-ink-muted outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password ? <p className="text-sm text-lost-ink">{errors.password}</p> : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        {/* Opt-in, never pre-ticked. Extends only the absolute session lifetime. */}
        <label htmlFor="remember" className="flex items-center gap-2 text-sm text-ink">
          <input id="remember" name="remember" type="checkbox" className="h-4 w-4 accent-accent" />
          Stay signed in for 7 days
        </label>
        <Link href="/forgot" className="text-sm text-accent-ink underline underline-offset-2 hover:opacity-80">
          Forgot password?
        </Link>
      </div>

      <button type="submit" disabled={pending} className="auth-primary mt-6">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
