'use client'

import type { EnquiryStatus } from '@prisma/client'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/form'
import { LOST_REASONS } from '@/lib/validation/enquiry-workflow'
import {
  contactEnquiry,
  loseEnquiry,
  setEnquiryAssignee,
  type EnquiryActionState,
} from './actions'

const INITIAL: EnquiryActionState = { status: 'idle' }

export function EnquiryActions({
  enquiryId,
  status,
  assignedUserId,
  assignable,
  csrf,
}: {
  enquiryId: string
  status: EnquiryStatus
  assignedUserId: string | null
  assignable: { id: string; name: string; role: string }[]
  csrf: string
}) {
  const [contactState, contactAction, contactPending] = useActionState(contactEnquiry, INITIAL)
  const [assignState, assignAction, assignPending] = useActionState(setEnquiryAssignee, INITIAL)
  const [lostState, lostAction, lostPending] = useActionState(loseEnquiry, INITIAL)

  const closed = status === 'WON' || status === 'LOST'
  const error =
    [contactState, assignState, lostState].find((state) => state.status === 'error') ?? null

  return (
    <div className="flex flex-col gap-5">
      {error && error.status === 'error' ? <Alert tone="danger" title={error.message} /> : null}

      {status === 'NEW' ? (
        <form action={contactAction} className="flex flex-col gap-2">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <Button type="submit" loading={contactPending} className="w-full">
            Mark as contacted
          </Button>
          <p className="text-xs text-ink-muted">
            Records the first reply time against the 24 hour commitment.
          </p>
        </form>
      ) : null}

      <form action={assignAction} className="flex flex-col gap-2">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="enquiryId" value={enquiryId} />
        <Field label="Assigned to" htmlFor="userId">
          <Select id="userId" name="userId" defaultValue={assignedUserId ?? ''}>
            <option value="">Nobody yet</option>
            {assignable.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" loading={assignPending} className="w-full">
          Save assignment
        </Button>
      </form>

      {closed ? (
        <p className="border-t border-line pt-4 text-sm text-ink-muted">
          This enquiry is closed as {status.toLowerCase()}. No further action is available here.
        </p>
      ) : (
        <form action={lostAction} className="flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          {/* BR-E10: a reason from the fixed list is required, so the control is a closed set. */}
          <Field label="Reason lost" htmlFor="reason">
            <Select id="reason" name="reason" defaultValue={LOST_REASONS[0]}>
              {LOST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" loading={lostPending} className="w-full">
            Mark as lost
          </Button>
        </form>
      )}
    </div>
  )
}
