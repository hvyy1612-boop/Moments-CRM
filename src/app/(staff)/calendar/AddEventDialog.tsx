'use client'

import { useActionState, useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Select, TextInput, Textarea } from '@/components/ui/form'
import { createCalendarEventAction, type CalendarActionState } from './actions'

const IDLE: CalendarActionState = { status: 'idle' }

type ClientOption = { id: string; displayName: string }

/**
 * "Add event" lets staff drop something straight onto the calendar - an appointment, an extra shoot,
 * or another studio event - without opening a case. Main shoots live on the job (a booking), so this
 * covers everything that is NOT part of a workflow.
 */
export function AddEventDialog({
  csrf,
  clients,
  defaultDate,
}: {
  csrf: string
  clients: ClientOption[]
  defaultDate: string
}) {
  const [open, setOpen] = useState(false)
  const [allDay, setAllDay] = useState(true)
  const [state, action, pending] = useActionState(createCalendarEventAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') setOpen(false)
  }, [state.status])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add event
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add calendar event"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-md border border-line bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-serif text-lg font-semibold text-ink">Add event</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form action={action} className="flex flex-col gap-4 px-5 py-4">
              <input type="hidden" name="csrf" value={csrf} />
              {state.status === 'error' ? <Alert tone="danger" title={state.message ?? 'Please check the form.'} /> : null}

              <Field label="Type" htmlFor="ev-kind">
                <Select id="ev-kind" name="kind" defaultValue="APPOINTMENT">
                  <option value="APPOINTMENT">Appointment</option>
                  <option value="SHOOT">Extra shoot</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>

              <Field label="Title" htmlFor="ev-title" required>
                <TextInput id="ev-title" name="title" placeholder="Client consultation" maxLength={200} required />
              </Field>

              <Field label="Date" htmlFor="ev-date" required>
                <TextInput id="ev-date" name="date" type="date" defaultValue={defaultDate} required />
              </Field>

              <Checkbox
                id="ev-allday"
                name="allDay"
                label="All day"
                checked={allDay}
                onChange={(e) => setAllDay(e.currentTarget.checked)}
              />

              {!allDay ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" htmlFor="ev-start">
                    <TextInput id="ev-start" name="startTime" type="time" defaultValue="09:00" />
                  </Field>
                  <Field label="End" htmlFor="ev-end">
                    <TextInput id="ev-end" name="endTime" type="time" />
                  </Field>
                </div>
              ) : null}

              <Field label="Client" htmlFor="ev-client" hint="Optional - links the event to a client.">
                <Select id="ev-client" name="clientId" defaultValue="">
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Location" htmlFor="ev-location">
                <TextInput id="ev-location" name="location" placeholder="Studio, Surry Hills" maxLength={255} />
              </Field>

              <Field label="Notes" htmlFor="ev-notes">
                <Textarea id="ev-notes" name="notes" rows={3} maxLength={2000} />
              </Field>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Add event
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
