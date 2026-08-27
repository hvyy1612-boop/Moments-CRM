'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/form'
import { createStaffEnquiryAction, type StaffEnquiryState } from '../actions'

const IDLE: StaffEnquiryState = { status: 'idle' }

export function StaffEnquiryForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(createStaffEnquiryAction, IDLE)
  const errors = state.status === 'error' ? state.errors : undefined

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" title={state.message} />
      ) : null}
      <input type="hidden" name="csrf" value={csrf} />
      <Field label="Client name" htmlFor="name" error={errors?.name}>
        <TextInput id="name" name="name" autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="email" error={errors?.email}>
        <TextInput id="email" name="email" type="email" autoComplete="email" />
      </Field>
      <Field label="Phone" htmlFor="phone" hint="Optional." error={errors?.phone}>
        <TextInput id="phone" name="phone" autoComplete="tel" />
      </Field>
      <Field label="What are they after?" htmlFor="eventType" hint="Wedding, portrait, etc. Optional.">
        <TextInput id="eventType" name="eventType" />
      </Field>
      <Field label="Notes" htmlFor="message" hint="What the client asked for." error={errors?.message}>
        <Textarea id="message" name="message" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Create project
        </Button>
      </div>
    </form>
  )
}
