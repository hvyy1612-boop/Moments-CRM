'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/form'
import { NewPasswordFields, PasswordInput } from '@/components/auth/PasswordFields'
import { RecoveryCodesPanel } from '@/components/auth/RecoveryCodesPanel'
import { changePassword, type ChangePasswordState } from './actions'

const INITIAL: ChangePasswordState = { status: 'idle' }

export function ChangePasswordForm({ csrf, requireCurrent = false }: { csrf: string; /** A voluntary change proves the current password. */ requireCurrent?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, INITIAL)

  // First password set: the recovery codes are shown once, before going on to the workspace.
  if (state.status === 'codes') {
    return (
      <RecoveryCodesPanel
        loginId={state.loginId}
        codes={state.codes}
        createdLabel={state.createdLabel}
        continueHref="/dashboard"
        continueLabel="I've saved them - continue"
      />
    )
  }

  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <input type="hidden" name="csrf" value={csrf} />

      {requireCurrent ? (
        <Field label="Current password" htmlFor="currentPassword" error={errors.current}>
          <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" autoFocus hasError={Boolean(errors.current)} />
        </Field>
      ) : null}

      <NewPasswordFields autoFocus={!requireCurrent} errors={errors} />

      <Button type="submit" loading={pending} className="w-full">
        Save and continue
      </Button>
    </form>
  )
}
