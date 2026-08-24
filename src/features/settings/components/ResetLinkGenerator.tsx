'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { generateResetLinkAction, type ResetLinkState } from '@/app/(staff)/settings/actions'

const INITIAL: ResetLinkState = { status: 'idle' }

/**
 * Admin-only: generate a one-time password reset link for a staff member and show it on screen to
 * copy and hand over (temporary path until a mail provider is wired). The link is single-use and
 * expires in 60 minutes.
 */
export function ResetLinkGenerator({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(generateResetLinkAction, INITIAL)

  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Password reset link (admin)</h2>
      <p className="mt-2 text-base text-ink-muted">
        Generate a one-time reset link for a staff member and give it to them directly. It works once
        and expires in 60 minutes.
      </p>

      <form action={action} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <input type="hidden" name="csrf" value={csrf} />
        <div className="flex-1">
          <Field label="Staff email" htmlFor="reset-email">
            <TextInput id="reset-email" name="email" type="email" placeholder="staff@moments.test" />
          </Field>
        </div>
        <Button type="submit" loading={pending}>
          Generate link
        </Button>
      </form>

      {state.status === 'error' ? (
        <div className="mt-4">
          <Alert tone="danger" title={state.message} />
        </div>
      ) : null}

      {state.status === 'link' ? (
        <div className="mt-4 flex flex-col gap-3">
          <Alert tone="success" title={`Reset link for ${state.email}`}>
            Copy this link and send it to them. Anyone with the link can set the password, so share it
            privately.
          </Alert>
          <input
            readOnly
            value={state.link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-line-strong bg-paper px-3 py-2 text-sm text-ink"
          />
        </div>
      ) : null}
    </div>
  )
}
