'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/form'
import { PasswordInput } from '@/components/auth/PasswordFields'
import { RecoveryCodesPanel } from '@/components/auth/RecoveryCodesPanel'
import { createRecoveryCodesAction, type RecoveryCodesState } from './actions'

const INITIAL: RecoveryCodesState = { status: 'idle' }

export function RecoveryCodesSection({ csrf, codesLeft }: { csrf: string; codesLeft: number }) {
  const [state, action, pending] = useActionState(createRecoveryCodesAction, INITIAL)

  return (
    <section className="mt-8 border-t border-line pt-6" aria-labelledby="recovery-heading">
      <h2 id="recovery-heading" className="text-lg font-semibold text-ink">
        Recovery codes
      </h2>

      {state.status === 'codes' ? (
        <div className="mt-4">
          <RecoveryCodesPanel loginId={state.loginId} codes={state.codes} createdLabel={state.createdLabel} continueHref="/dashboard" continueLabel="Done" />
        </div>
      ) : (
        <>
          <p className="mt-1 text-base text-ink-muted">
            {codesLeft > 0
              ? `You have ${codesLeft} of 6 codes left. Use one to reset a forgotten password.`
              : 'You have no recovery codes. Create them so you can reset a forgotten password yourself.'}{' '}
            Creating new codes cancels the old ones.
          </p>
          <form action={action} className="mt-4 flex flex-col gap-4">
            {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
            <input type="hidden" name="csrf" value={csrf} />
            <Field label="Current password" htmlFor="recoveryCurrentPassword">
              <PasswordInput id="recoveryCurrentPassword" name="currentPassword" autoComplete="current-password" />
            </Field>
            <Button type="submit" variant="secondary" loading={pending} className="w-full">
              Create new recovery codes
            </Button>
          </form>
        </>
      )}
    </section>
  )
}
