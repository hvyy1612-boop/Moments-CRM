'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { sendContractAction, type QuoteActionState } from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

export function ContractSend({
  csrf,
  contractId,
  projectId,
  enquiryId,
}: {
  csrf: string
  contractId: string
  projectId: string

  enquiryId?: string
}) {
  const [state, action, sending] = useActionState(sendContractAction, IDLE)

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="projectId" value={projectId} />
      {enquiryId ? <input type="hidden" name="enquiryId" value={enquiryId} /> : null}
      <p className="text-sm text-ink-muted">
        The contract snapshots the accepted quote. Send the private link for the client to sign.
      </p>
      <div>
        <Button type="submit" loading={sending}>
          Send contract
        </Button>
      </div>
    </form>
  )
}
