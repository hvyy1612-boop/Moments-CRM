'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Select, Textarea, TextInput } from '@/components/ui/form'
import { submitEnquiry, type EnquiryFormState } from './actions'

const INITIAL: EnquiryFormState = { status: 'idle' }

export function EnquiryForm({ defaultPackage }: { defaultPackage?: string }) {
  const [state, action, pending] = useActionState(submitEnquiry, INITIAL)

  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Thank you, we have your enquiry">
        Someone from the studio will reply within 24 hours, and we will text you to say a reply is on
        the way.
        {state.farFutureWarning
          ? ' Your date is more than 18 months away, so the studio will confirm availability closer to the time.'
          : ''}
      </Alert>
    )
  }

  const errors = state.status === 'error' ? state.errors : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" title={state.message} />
      ) : null}

      <Field label="Your name" htmlFor="primaryName" required error={errors.primaryName}>
        <TextInput id="primaryName" name="primaryName" hasError={Boolean(errors.primaryName)} />
      </Field>

      <Field label="Partner's name" htmlFor="partnerName">
        <TextInput id="partnerName" name="partnerName" />
      </Field>

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <TextInput id="email" name="email" type="email" hasError={Boolean(errors.email)} />
      </Field>

      <Field label="Mobile" htmlFor="phone" hint="We send a text, we do not call.">
        <TextInput id="phone" name="phone" type="tel" />
      </Field>

      <Field label="What is it for" htmlFor="enquiryType" required error={errors.enquiryType}>
        <Select
          id="enquiryType"
          name="enquiryType"
          defaultValue="WEDDING"
          hasError={Boolean(errors.enquiryType)}
        >
          <option value="WEDDING">Wedding</option>
          <option value="MICRO">Micro wedding or elopement</option>
          <option value="PORTRAIT">Portrait session</option>
        </Select>
      </Field>

      <Field label="Event date" htmlFor="eventDate" required error={errors.eventDate}>
        <TextInput id="eventDate" name="eventDate" type="date" hasError={Boolean(errors.eventDate)} />
      </Field>

      <Field label="Venue" htmlFor="venueName" hint="If you know it yet.">
        <TextInput id="venueName" name="venueName" />
      </Field>

      <Field label="Anything you want to tell the studio" htmlFor="message">
        <Textarea id="message" name="message" placeholder="Your plans, your style, what matters to you." />
      </Field>

      {defaultPackage ? <input type="hidden" name="packageCodes" value={defaultPackage} /> : null}

      <Checkbox
        id="marketingConsent"
        name="marketingConsent"
        label="Send me occasional updates from the studio. You can opt out at any time."
      />

      <div>
        <Button type="submit" loading={pending}>
          Send enquiry
        </Button>
      </div>
    </form>
  )
}
