'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { confirmActivityAccessAction, type StepUpState } from './actions'

const INITIAL: StepUpState = { status: 'idle' }

/** Step-up prompt shown instead of the Activity content until the admin re-enters their password. */
export function ActivityGate({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(confirmActivityAccessAction, INITIAL)
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-md border border-line bg-surface p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-tint text-accent-ink">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 className="text-lg font-semibold text-ink">Confirm it&rsquo;s you</h2>
        <p className="text-sm text-ink-muted">This page shows security and account activity. Re-enter your password to continue - the confirmation lasts about 10 minutes.</p>
      </div>

      {state.status === 'error' ? <div className="mt-4"><Alert tone="danger" title={state.message ?? 'Could not confirm.'} /></div> : null}

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="csrf" value={csrf} />
        <Field label="Your password" htmlFor="stepup-password">
          <TextInput id="stepup-password" name="password" type="password" required autoFocus autoComplete="current-password" />
        </Field>
        <Button type="submit" loading={pending} className="w-full">Unlock activity</Button>
      </form>
    </div>
  )
}
