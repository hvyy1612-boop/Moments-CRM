'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { sendQuotationAction, type SendState } from './actions'

const INITIAL: SendState = { status: 'idle' }

export function SendQuotation({
  quotationId,
  status,
  requiresManualPricing,
  clientLink,
  clientEmail,
  csrf,
}: {
  quotationId: string
  status: string
  requiresManualPricing: boolean
  clientLink: string
  clientEmail: string
  csrf: string
}) {
  const [state, action, pending] = useActionState(sendQuotationAction, INITIAL)

  if (status === 'DRAFT') {
    return (
      <div className="flex flex-col gap-3">
        {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
        {/* BR-P09: sending is blocked until a human prices the travel. */}
        {requiresManualPricing ? (
          <Alert tone="warning" title="Travel needs pricing first">
            The venue is beyond the included radius. Add a travel line to the quotation before
            sending it.
          </Alert>
        ) : null}
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="quotationId" value={quotationId} />
          <Button type="submit" loading={pending} disabled={requiresManualPricing} className="w-full">
            Send to {clientEmail}
          </Button>
        </form>
        <p className="text-xs text-ink-muted">
          Sends the link and starts the 14 day validity. After this the quotation is locked, and any
          change creates a new version.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {status === 'SENT'
          ? 'Sent. The client can open this link and decide.'
          : 'This quotation is closed. The link stays readable for the client.'}
      </p>
      <div>
        <p className="text-xs text-ink-muted">Client link</p>
        {/* BR-T04: the token identifies the quotation, no personal data in the URL. */}
        <p className="mt-1 break-all rounded border border-line bg-paper px-3 py-2 text-xs text-ink">
          {clientLink}
        </p>
      </div>
    </div>
  )
}
