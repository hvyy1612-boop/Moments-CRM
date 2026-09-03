'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { completeOnboarding, type OnboardingState } from './actions'

const INITIAL: OnboardingState = { status: 'idle' }

export function OnboardingForm({ csrf, defaultName }: { csrf: string; defaultName: string }) {
  const [state, action, pending] = useActionState(completeOnboarding, INITIAL)
  const errors = state.status === 'error' ? (state.errors ?? {}) : {}

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Your name" htmlFor="name" hint="This is how you'll appear across the workspace." error={errors.name}>
        <TextInput id="name" name="name" autoComplete="name" autoFocus defaultValue={defaultName} hasError={Boolean(errors.name)} />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        Continue to workspace
      </Button>
    </form>
  )
}
