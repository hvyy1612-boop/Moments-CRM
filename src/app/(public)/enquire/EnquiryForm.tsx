'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/form'
import { submitEnquiry, type EnquiryFormState } from './actions'

const INITIAL: EnquiryFormState = { status: 'idle' }

export function EnquiryForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(submitEnquiry, INITIAL)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Thank you, your enquiry is in">
        We reply to every enquiry within a day. We will send you a text to say it is on the way, so it
        does not sit unread in a spam folder.
      </Alert>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" title={state.message} />
      ) : null}

      <input type="hidden" name="csrf" value={csrf} />
      {/* Bot trap: hidden from people and screen readers, so only a script fills it in. */}
      <div aria-hidden="true" className="sr-only">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field label="Your name" htmlFor="name" error={errors.name}>
        <TextInput id="name" name="name" autoComplete="name" autoFocus hasError={Boolean(errors.name)} />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email}>
        <TextInput id="email" name="email" type="email" autoComplete="email" hasError={Boolean(errors.email)} />
      </Field>

      <Field label="Phone" htmlFor="phone" hint="Optional, for a quick text back." error={errors.phone}>
        <TextInput id="phone" name="phone" type="tel" autoComplete="tel" hasError={Boolean(errors.phone)} />
      </Field>

      <Field label="What are you after" htmlFor="eventType" hint="Wedding, portrait, or something else.">
        <TextInput id="eventType" name="eventType" />
      </Field>

      <Field label="Tell us about your day" htmlFor="message" error={errors.message}>
        <Textarea id="message" name="message" hasError={Boolean(errors.message)} />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Send enquiry
      </Button>
    </form>
  )
}
