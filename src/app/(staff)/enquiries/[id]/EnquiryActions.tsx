'use client'

import type { EnquiryStatus } from '@prisma/client'
import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/form'
import { LOST_REASONS } from '@/lib/validation/enquiry-workflow'
import {
  contactEnquiry,
  loseEnquiry,
  reopenLostEnquiry,
  setEnquiryAssignee,
  updateLostReason,
  type EnquiryActionState,
} from './actions'

const INITIAL: EnquiryActionState = { status: 'idle' }

export function EnquiryActions({
  enquiryId,
  status,
  lostReason,
  assignedUserId,
  assignable,
  csrf,
}: {
  enquiryId: string
  status: EnquiryStatus
  lostReason: string | null
  assignedUserId: string | null
  assignable: { id: string; name: string; role: string }[]
  csrf: string
}) {
  const [contactState, contactAction, contactPending] = useActionState(contactEnquiry, INITIAL)
  const [assignState, assignAction, assignPending] = useActionState(setEnquiryAssignee, INITIAL)
  const [lostState, lostAction, lostPending] = useActionState(loseEnquiry, INITIAL)
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenLostEnquiry, INITIAL)
  const [reasonState, reasonAction, reasonPending] = useActionState(updateLostReason, INITIAL)

  // Marking lost closes the enquiry, so it asks first. One stray click should never end a job.
  const [confirmingLost, setConfirmingLost] = useState(false)
  const [reason, setReason] = useState<string>(LOST_REASONS[0])

  const error =
    [contactState, assignState, lostState, reopenState, reasonState].find(
      (state) => state.status === 'error',
    ) ?? null

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

      {status === 'WON' ? (
        <p className="border-t border-line pt-4 text-sm text-ink-muted">
          This enquiry was won and has become a booking. Changes belong on the booking from here.
        </p>
      ) : status === 'LOST' ? (
        // Closed, but never a dead end: the reason can be corrected and the enquiry reopened.
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div>
            <p className="text-sm text-ink">Marked as lost</p>
            <p className="text-xs text-ink-muted">
              Reason: {lostReason ?? 'not recorded'}. Correct it below, or reopen the enquiry if
              this was a mistake.
            </p>
          </div>

          <form action={reasonAction} className="flex flex-col gap-2">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <Field label="Change reason" htmlFor="reason">
              <Select id="reason" name="reason" defaultValue={lostReason ?? LOST_REASONS[0]}>
                {LOST_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary" loading={reasonPending} className="w-full">
              Save reason
            </Button>
          </form>

          <form action={reopenAction} className="flex flex-col gap-2">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <Button type="submit" loading={reopenPending} className="w-full">
              Reopen enquiry
            </Button>
            <p className="text-xs text-ink-muted">
              Puts it back in the working list. The timeline keeps both the closure and this
              correction.
            </p>
          </form>
        </div>
      ) : confirmingLost ? (
        <form action={lostAction} className="flex flex-col gap-3 border-t border-line pt-4">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="reason" value={reason} />
          <div>
            <p className="text-sm text-ink">Mark this enquiry as lost?</p>
            <p className="text-xs text-ink-muted">
              Reason: {reason}. It leaves the working list. You can reopen it afterwards if you
              change your mind.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={lostPending} className="flex-1">
              Yes, mark as lost
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmingLost(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {/* BR-E10: a reason from the fixed list is required, so the control is a closed set. */}
          <Field label="Reason lost" htmlFor="reason">
            <Select
              id="reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {LOST_REASONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmingLost(true)}
            className="w-full"
          >
            Mark as lost
          </Button>
        </div>
      )}
    </div>
  )
}
