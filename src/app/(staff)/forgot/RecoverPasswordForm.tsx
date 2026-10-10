'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { NewPasswordFields } from '@/components/auth/PasswordFields'
import { recoverPasswordAction, type RecoverState } from './actions'

const INITIAL: RecoverState = { status: 'idle' }

export function RecoverPasswordForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(recoverPasswordAction, INITIAL)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Login ID" htmlFor="loginId">
        <TextInput
          id="loginId"
          name="loginId"
          type="email"
          autoComplete="username"
          placeholder="s26xxxx@staff.moments.com"
          defaultValue={state.status === 'error' ? state.loginId : ''}
          autoFocus
          required
        />
      </Field>

      <Field label="Recovery code" htmlFor="code" hint="e.g. ABCDE-FGHJK. Each code works once.">
        <TextInput id="code" name="code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} className="font-mono tracking-wider" required />
      </Field>

      <NewPasswordFields errors={errors} />

      <Button type="submit" loading={pending} className="w-full">
        Set new password
      </Button>
      <p className="flex justify-between gap-3 text-sm text-ink-muted">
        <span>No codes left? Ask your admin.</span>
        <Link href="/login" className="font-bold text-accent-ink hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
