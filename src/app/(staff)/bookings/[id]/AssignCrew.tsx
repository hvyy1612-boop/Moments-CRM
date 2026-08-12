'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/form'
import { assignCrewAction, type BookingActionState } from './actions'

const INITIAL: BookingActionState = { status: 'idle' }

const SLOTS = [
  { slot: 'leadPhotographerId', label: 'Lead photographer' },
  { slot: 'leadVideographerId', label: 'Lead videographer' },
  { slot: 'secondShooterId', label: 'Second shooter' },
] as const

export function AssignCrew({
  bookingId,
  crew,
  current,
  csrf,
}: {
  bookingId: string
  crew: { id: string; name: string; crewRole: string; isContractor: boolean }[]
  current: Record<string, string | null>
  csrf: string
}) {
  const [state, action, pending] = useActionState(assignCrewAction, INITIAL)

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="bookingId" value={bookingId} />

      {SLOTS.map(({ slot, label }) => (
        <Field key={slot} label={label} htmlFor={slot}>
          <Select id={slot} name={slot} defaultValue={current[slot] ?? ''}>
            <option value="">Nobody yet</option>
            {crew.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.isContractor ? ' (contract)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      ))}

      <Button type="submit" variant="secondary" loading={pending} className="w-full">
        Save crew
      </Button>
      <p className="text-xs text-ink-muted">
        Nobody can hold two confirmed bookings on the same date, whichever role they are in.
      </p>
    </form>
  )
}
