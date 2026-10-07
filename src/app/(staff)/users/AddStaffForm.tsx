'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { addStaffAction, type AddStaffState } from './actions'

const INITIAL: AddStaffState = { status: 'idle' }

export function AddStaffForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(addStaffAction, INITIAL)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'created' ? (
        <div className="rounded-md border border-line bg-delivered p-4">
          <div className="text-sm font-bold text-delivered-ink">Account created for {state.name}</div>
          <p className="mt-1 text-sm text-ink-muted">
            Copy these now and give them to the staff member. The password is shown only once. They’ll set
            their own password on first sign-in.
          </p>
          <dl className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-24 text-xs font-bold uppercase tracking-wide text-muted">Staff ID</dt>
              <dd className="tabular select-all rounded border border-line bg-surface px-2 py-1 text-sm text-ink">{state.staffLoginId}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-24 text-xs font-bold uppercase tracking-wide text-muted">Password</dt>
              <dd className="select-all rounded border border-line bg-surface px-2 py-1 text-sm text-ink">{state.tempPassword}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <form action={action} className="flex flex-wrap items-end gap-3">
        {state.status === 'error' && state.message ? (
          <div className="w-full"><Alert tone="danger" title={state.message} /></div>
        ) : null}
        <input type="hidden" name="csrf" value={csrf} />
        <div className="min-w-48 flex-1">
          <Field label="Staff name" htmlFor="name" error={errors.name}>
            <TextInput id="name" name="name" autoComplete="off" hasError={Boolean(errors.name)} />
          </Field>
        </div>
        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-ink">Role</label>
          <select
            id="role"
            name="role"
            defaultValue="STUDIO"
            className="h-11 rounded-md border border-line-strong bg-surface px-3 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="STUDIO">Staff</option>
            <option value="SUPERVISOR">Supervisor (read only)</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <Button type="submit" loading={pending}>Add staff</Button>
      </form>
    </div>
  )
}
