'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { NewPasswordFields } from '@/components/auth/PasswordFields'
import { RecoveryCodesPanel } from '@/components/auth/RecoveryCodesPanel'
import { AuthTitle } from '@/components/auth/AuthCard'
import type { Role } from '@/lib/auth/permissions'
import { registerAction, type RegisterState } from './actions'

const INITIAL: RegisterState = { status: 'idle' }

const ROLE_TITLE: Record<Role, string> = { STUDIO: 'Staff', SUPERVISOR: 'Supervisor', ADMIN: 'Admin' }

export function RegisterForm({ csrf, roles }: { csrf: string; roles: Role[] }) {
  const [state, action, pending] = useActionState(registerAction, INITIAL)

  if (state.status === 'created') {
    return (
      <>
        <AuthTitle title={`Your ${state.roleLabel} account is ready`} subtitle="Save your login ID and recovery codes to continue." />
        <RecoveryCodesPanel loginId={state.loginId} codes={state.codes} createdLabel={state.createdLabel} continueHref="/login" continueLabel="Go to sign in" showLoginId />
      </>
    )
  }

  const errors = state.status === 'error' ? (state.errors ?? {}) : {}
  const values = state.status === 'error' ? state.values : { name: '', role: '' }

  return (
    <>
    <AuthTitle title="Create an account" subtitle="You will get a login ID and recovery codes." />
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Full name" htmlFor="name" error={errors.name}>
        <TextInput id="name" name="name" autoComplete="name" defaultValue={values.name} hasError={Boolean(errors.name)} autoFocus required />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Role</legend>
        <div className="flex gap-2">
          {roles.map((role) => (
            <label key={role} className="flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 text-base text-ink has-[:checked]:border-ink">
              <input type="radio" name="role" value={role} defaultChecked={values.role ? values.role === role : role === 'STUDIO'} className="accent-ink" />
              {ROLE_TITLE[role]}
            </label>
          ))}
        </div>
        {errors.role ? <p className="mt-1 text-sm text-danger">{errors.role}</p> : null}
      </fieldset>

      <NewPasswordFields errors={errors} />

      <Button type="submit" loading={pending} className="w-full">
        Create account
      </Button>
      <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
        Already have an account? Sign in
      </Link>
    </form>
    </>
  )
}
