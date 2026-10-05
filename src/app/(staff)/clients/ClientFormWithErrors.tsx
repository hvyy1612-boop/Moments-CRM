'use client'

import { useActionState } from 'react'
import { ClientForm, type ClientFormValues } from './ClientForm'
import { createClientFormAction, updateClientFormAction, type ClientFormState } from './actions'

const IDLE: ClientFormState = { status: 'idle' }

/**
 * The full-page client form (/clients/new, edit) wired to the error-returning save actions: a refused
 * save shows one friendly message and re-fills what was typed, instead of the root error page.
 */
export function ClientFormWithErrors({
  mode,
  csrf,
  values,
  clientId,
  submitLabel,
  showEnquiryFields = false,
}: {
  mode: 'create' | 'update'
  csrf: string
  values?: ClientFormValues
  clientId?: string
  submitLabel: string
  showEnquiryFields?: boolean
}) {
  const [state, formAction] = useActionState(mode === 'create' ? createClientFormAction : updateClientFormAction, IDLE)
  return (
    <ClientForm
      action={formAction}
      csrf={csrf}
      values={state.status === 'error' ? state.values : values}
      clientId={clientId}
      submitLabel={submitLabel}
      showEnquiryFields={showEnquiryFields}
      formError={state.status === 'error' ? state.message : undefined}
    />
  )
}
