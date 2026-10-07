'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { NewPasswordFields } from '@/components/auth/PasswordFields'
import { RecoveryCodesPanel } from '@/components/auth/RecoveryCodesPanel'
import type { Role } from '@/lib/auth/permissions'
import { registerAction, type RegisterState } from './actions'

const INITIAL: RegisterState = { status: 'idle' }

const ROLE_INFO: Record<Role, { title: string; body: string }> = {
  STUDIO: { title: 'Staff', body: 'Day-to-day work: leads, quotes, jobs, invoices and the calendar.' },
  SUPERVISOR: { title: 'Supervisor', body: 'Read only: sees every page, cannot change anything. No Activity log.' },
  ADMIN: { title: 'Admin', body: 'Everything, plus users, settings and the Activity log.' },
}

export function RegisterForm({ csrf, roles }: { csrf: string; roles: Role[] }) {
  const [state, action, pending] = useActionState(registerAction, INITIAL)
  const [copied, setCopied] = useState(false)

  if (state.status === 'created') {
    return (
      <div className="mt-6 flex flex-col gap-5">
        <Alert tone="success" title={`Your ${state.roleLabel} account is ready`}>
          Sign in with this login ID and the password you just chose.
        </Alert>
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Your login ID</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-base text-ink">
              {state.loginId.split('@')[0]}@<wbr />
              {state.loginId.split('@')[1]}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.loginId)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2500)
                } catch {
                  setCopied(false)
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="mt-2 text-sm text-ink-muted">The system made this ID for you. It is also in the recovery codes file.</p>
        </div>
        <RecoveryCodesPanel loginId={state.loginId} codes={state.codes} createdLabel={state.createdLabel} continueHref="/login" continueLabel="I've saved them - go to sign in" />
      </div>
    )
  }

  const errors = state.status === 'error' ? (state.errors ?? {}) : {}
  const values = state.status === 'error' ? state.values : { name: '', role: '' }

  return (
    <form action={action} className="mt-6 flex flex-col gap-5">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Full name" htmlFor="name" error={errors.name}>
        <TextInput id="name" name="name" autoComplete="name" defaultValue={values.name} hasError={Boolean(errors.name)} autoFocus required />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">Role</legend>
        {roles.map((role) => (
          <label key={role} className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface p-3 has-[:checked]:border-ink">
            <input type="radio" name="role" value={role} defaultChecked={values.role ? values.role === role : role === 'STUDIO'} className="mt-1 accent-ink" />
            <span>
              <span className="block text-base font-medium text-ink">{ROLE_INFO[role].title}</span>
              <span className="block text-sm text-ink-muted">{ROLE_INFO[role].body}</span>
            </span>
          </label>
        ))}
        {errors.role ? <p className="text-sm text-danger">{errors.role}</p> : null}
      </fieldset>

      <NewPasswordFields errors={errors} />

      <Button type="submit" loading={pending} className="w-full">
        Create account
      </Button>
      <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
        Already have an account? Sign in
      </Link>
    </form>
  )
}
