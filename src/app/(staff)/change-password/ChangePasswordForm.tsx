'use client'

import { type ReactNode, useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { PASSWORD_RULES } from '@/lib/auth/password-rules'
import { changePassword, type ChangePasswordState } from './actions'

const INITIAL: ChangePasswordState = { status: 'idle' }

const SVG = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="absolute inset-y-0 right-0 flex items-center rounded px-3 text-ink-muted outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
    >
      {shown ? (
        <svg viewBox="0 0 24 24" strokeWidth={1.7} {...SVG} className="h-5 w-5" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" strokeWidth={1.7} {...SVG} className="h-5 w-5" aria-hidden="true">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

function RuleRow({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-sm transition-colors ${met ? 'text-ink' : 'text-ink-muted'}`}>
      {met ? (
        <svg viewBox="0 0 24 24" strokeWidth={2.4} {...SVG} className="h-4 w-4 shrink-0 text-ok" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" strokeWidth={1.6} {...SVG} className="h-4 w-4 shrink-0 text-line-strong" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
        </svg>
      )}
      <span>{children}</span>
    </li>
  )
}

export function ChangePasswordForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(changePassword, INITIAL)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  const mismatch = confirm.length > 0 && confirm !== password
  const matched = confirm.length > 0 && confirm === password

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <input type="hidden" name="csrf" value={csrf} />

      <div className="flex flex-col gap-2">
        <Field label="New password" htmlFor="password" error={errors.password}>
          <div className="relative">
            <TextInput
              id="password"
              name="password"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hasError={Boolean(errors.password)}
              className="pr-12"
            />
            <EyeToggle shown={showNew} onToggle={() => setShowNew((v) => !v)} />
          </div>
        </Field>

        {/* Live requirements: the same rules the server enforces (SEC-P04). */}
        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-paper px-3 py-2.5">
          {PASSWORD_RULES.map((rule) => (
            <RuleRow key={rule.id} met={rule.test(password)}>
              {rule.label}
            </RuleRow>
          ))}
        </ul>
      </div>

      <Field
        label="Confirm new password"
        htmlFor="confirm"
        error={mismatch ? 'The two passwords do not match.' : errors.confirm}
      >
        <div className="relative">
          <TextInput
            id="confirm"
            name="confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            hasError={Boolean(errors.confirm) || mismatch}
            className="pr-12"
          />
          <EyeToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
        </div>
      </Field>

      {matched ? (
        <p className="-mt-3 flex items-center gap-2 text-sm text-ok">
          <svg viewBox="0 0 24 24" strokeWidth={2.4} {...SVG} className="h-4 w-4 shrink-0" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Passwords match
        </p>
      ) : null}

      <Button type="submit" loading={pending} className="w-full">
        Save and continue
      </Button>
    </form>
  )
}
