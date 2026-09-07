'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { GoogleMark } from '@/components/auth/GoogleMark'
import { Alert } from '@/components/ui/Alert'
import { signIn, type LoginFormState } from './actions'

const INITIAL: LoginFormState = { status: 'idle' }

export function LoginForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(signIn, INITIAL)
  const [showPassword, setShowPassword] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <>
      <form action={action} className="mt-6 flex flex-col">
        {state.status === 'error' && state.message ? (
          <div className="mb-4">
            <Alert tone="danger" title={state.message} />
          </div>
        ) : null}

        <input type="hidden" name="csrf" value={csrf} />

        {/* Field rhythm (gap-5), matching the reference spacing. */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="login-label">Email</label>
            <div className="login-field-wrap">
              <svg className="login-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                <path d="m3 6 9 6 9-6" />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@moments.com"
                className={`login-field${errors.email ? ' has-error' : ''}`}
              />
            </div>
            {errors.email ? <p className="text-sm text-lost-ink">{errors.email}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="login-label">Password</label>
            <div className="login-field-wrap">
              <svg className="login-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              </svg>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                className={`login-field pw${errors.password ? ' has-error' : ''}`}
              />
              {/* Show/hide toggle, keyboard reachable and labelled for screen readers. */}
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="login-eye outline-none focus-visible:text-ink"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          <label htmlFor="remember" className="login-check flex items-center gap-2">
            <input id="remember" name="remember" type="checkbox" className="h-4 w-4 accent-accent" />
            Remember me
          </label>
          <Link href="/forgot" className="login-link">Forgot password?</Link>
        </div>

        <button type="submit" disabled={pending} className="login-primary mt-5">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Google sign-in is a real, admin-provisioned-only flow (it signs in existing staff, never
          creates accounts). It is a plain GET link to the OAuth route, not a form action. */}
      <div className="login-divider mt-5">or continue with</div>

      <a href="/api/auth/google" className="login-google mt-4">
        <GoogleMark />
        Sign in with Google
      </a>
    </>
  )
}
