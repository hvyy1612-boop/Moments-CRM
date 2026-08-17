'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import { Field, Select, TextInput } from '@/components/ui/form'
import { assignResourceAction, createBookingAction, type QuoteActionState } from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

export type ResourceOption = { id: string; name: string; resourceType: string }
export type AssignmentView = { id: string; resourceName: string; role: string | null }
export type BookingView = {
  id: string
  title: string | null
  timeLabel: string
  location: string | null
  status: string
  assignments: AssignmentView[]
}

function AssignForm({
  csrf,
  projectId,
  bookingId,
  resources,
}: {
  csrf: string
  projectId: string
  bookingId: string
  resources: ResourceOption[]
}) {
  const [state, action, pending] = useActionState(assignResourceAction, IDLE)

  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <Select name="resourceId" aria-label="Resource" defaultValue="">
            <option value="" disabled>
              Choose someone to assign
            </option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-4">
          <TextInput name="role" aria-label="Role" placeholder="Role (optional)" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" size="sm" loading={pending} className="w-full">
            Assign
          </Button>
        </div>
      </div>
    </form>
  )
}

function AddBookingForm({ csrf, projectId }: { csrf: string; projectId: string }) {
  const [state, action, pending] = useActionState(createBookingAction, IDLE)

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Alert tone="success" title="Shoot scheduled" /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="What is this shoot?" htmlFor="title">
        <TextInput id="title" name="title" placeholder="Wedding day, engagement shoot..." />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Starts" htmlFor="startsAt">
          <TextInput id="startsAt" name="startsAt" type="datetime-local" />
        </Field>
        <Field label="Ends" htmlFor="endsAt">
          <TextInput id="endsAt" name="endsAt" type="datetime-local" />
        </Field>
      </div>
      <Field label="Location" htmlFor="location">
        <TextInput id="location" name="location" placeholder="Venue or address" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Schedule shoot
        </Button>
      </div>
    </form>
  )
}

export function Scheduling({
  csrf,
  projectId,
  bookings,
  resources,
}: {
  csrf: string
  projectId: string
  bookings: BookingView[]
  resources: ResourceOption[]
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {bookings.length === 0 ? (
        <p className="text-sm text-ink-muted">No shoots scheduled yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {bookings.map((booking) => (
            <li key={booking.id} className="rounded border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-ink">{booking.title ?? 'Shoot'}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {booking.timeLabel}
                    {booking.location ? ` · ${booking.location}` : ''}
                  </p>
                </div>
                <StatusPill tone="info">{booking.status.toLowerCase()}</StatusPill>
              </div>

              {booking.assignments.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1">
                  {booking.assignments.map((assignment) => (
                    <li key={assignment.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-ink">{assignment.resourceName}</span>
                      <span className="text-ink-muted">{assignment.role ?? 'Crew'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">No crew assigned yet.</p>
              )}

              <AssignForm
                csrf={csrf}
                projectId={projectId}
                bookingId={booking.id}
                resources={resources}
              />
            </li>
          ))}
        </ul>
      )}

      <AddBookingForm csrf={csrf} projectId={projectId} />
    </div>
  )
}
