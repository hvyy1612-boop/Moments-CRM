'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { confirmActivityAccessAction, type StepUpState } from './actions'

const INITIAL: StepUpState = { status: 'idle' }

type View = 'pin' | 'create' | 'password'

/** Shared look for a 4-digit PIN box: numeric keypad on mobile, centred, widely tracked digits. */
const PIN_INPUT = 'text-center text-lg tracking-[0.4em] tabular'
const pinProps = { inputMode: 'numeric' as const, pattern: '\\d*', maxLength: 4, autoComplete: 'off' as const, className: PIN_INPUT }

const COPY: Record<View, { title: string; blurb: string }> = {
  create: {
    title: 'Set an Activity PIN',
    blurb: 'This page shows security and account activity. Choose a 4-digit PIN to open it - you will enter this PIN next time, not your password.',
  },
  pin: {
    title: 'Enter your PIN',
    blurb: 'This page shows security and account activity. Enter your 4-digit PIN to continue - it stays unlocked for about 10 minutes.',
  },
  password: {
    title: 'Use your password',
    blurb: 'Forgotten or locked out of your PIN? Confirm your account password to open Activity, or reset your PIN and pick a new one.',
  },
}

/**
 * Step-up prompt shown instead of the Activity content until the admin proves it is them. A 4-digit PIN
 * is the primary path (set on first visit, entered thereafter); the account password is the fallback so
 * a forgotten or locked-out PIN never locks an admin out of the page.
 */
export function ActivityGate({ csrf, pinIsSet, locked }: { csrf: string; pinIsSet: boolean; locked: boolean }) {
  const [state, action, pending] = useActionState(confirmActivityAccessAction, INITIAL)
  // No PIN yet -> create one. PIN currently locked out -> start on the password fallback. Otherwise -> enter PIN.
  const [view, setView] = useState<View>(!pinIsSet ? 'create' : locked ? 'password' : 'pin')
  const copy = COPY[view]

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-md border border-line bg-surface p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-tint text-accent-ink">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 className="text-lg font-semibold text-ink">{copy.title}</h2>
        <p className="text-sm text-ink-muted">{copy.blurb}</p>
      </div>

      {state.status === 'error' ? <div className="mt-4"><Alert tone="danger" title={state.message ?? 'Could not confirm.'} /></div> : null}

      {view === 'create' ? (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="mode" value="create" />
          <Field label="Choose a 4-digit PIN" htmlFor="pin-new" hint="Avoid 1234 or four repeated digits.">
            <TextInput id="pin-new" name="pin" required autoFocus {...pinProps} />
          </Field>
          <Field label="Confirm PIN" htmlFor="pin-confirm">
            <TextInput id="pin-confirm" name="pinConfirm" required {...pinProps} />
          </Field>
          <Button type="submit" loading={pending} className="w-full">Set PIN and continue</Button>
        </form>
      ) : null}

      {view === 'pin' ? (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="mode" value="pin" />
          <Field label="Your PIN" htmlFor="pin-enter">
            <TextInput id="pin-enter" name="pin" required autoFocus {...pinProps} />
          </Field>
          <Button type="submit" loading={pending} className="w-full">Unlock activity</Button>
          <button type="button" onClick={() => setView('password')} className="text-sm font-medium text-accent-ink hover:underline">
            Use your password instead
          </button>
        </form>
      ) : null}

      {view === 'password' ? (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="mode" value="password" />
          <Field label="Your account password" htmlFor="stepup-password">
            <TextInput id="stepup-password" name="password" type="password" required autoFocus autoComplete="current-password" />
          </Field>
          <Button type="submit" name="intent" value="unlock" loading={pending} className="w-full">Unlock activity</Button>
          {pinIsSet ? (
            <Button type="submit" name="intent" value="reset" variant="secondary" disabled={pending} className="w-full">
              Reset my PIN
            </Button>
          ) : null}
          {pinIsSet ? (
            <button type="button" onClick={() => setView('pin')} className="text-sm font-medium text-accent-ink hover:underline">
              Use your PIN instead
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}
