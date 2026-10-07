'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/form'
import { NewPasswordFields, PasswordInput } from '@/components/auth/PasswordFields'
import { RecoveryCodesPanel } from '@/components/auth/RecoveryCodesPanel'
import { AuthTitle } from '@/components/auth/AuthCard'
import { changePassword, type ChangePasswordState } from './actions'

const INITIAL: ChangePasswordState = { status: 'idle' }

export function ChangePasswordForm({ csrf, requireCurrent = false }: { csrf: string; /** A voluntary change proves the current password. */ requireCurrent?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, INITIAL)

  // First password set: the recovery codes are shown once, before going on to the workspace.
  if (state.status === 'codes') {
    return (
      <>
        <AuthTitle title="Secure your account" subtitle="Save your recovery codes to continue." />
        <RecoveryCodesPanel loginId={state.loginId} codes={state.codes} createdLabel={state.createdLabel} continueHref="/dashboard" />
      </>
    )
  }

  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <>
    {requireCurrent ? (
      <AuthTitle title="Password and recovery codes" subtitle="Enter your current password, then choose a new one. Your other signed-in devices will be signed out." />
    ) : (
      <AuthTitle title="Set a new password" subtitle="Choose your own password to finish signing in." />
    )}
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
    </>
  )
}
