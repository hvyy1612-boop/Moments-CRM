'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/form'
import { setDeliverableAction, type BookingActionState } from './actions'

const INITIAL: BookingActionState = { status: 'idle' }

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Not started',
  IN_PROGRESS: 'In progress',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
}

export function DeliverableRow({
  id,
  label,
  status,
  dueDate,
  overdue,
  galleryUrl,
  csrf,
}: {
  id: string
  label: string
  status: string
  dueDate: string
  overdue: boolean
  galleryUrl: string | null
  csrf: string
}) {
  const [state, action, pending] = useActionState(setDeliverableAction, INITIAL)
  const [editing, setEditing] = useState(false)

  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-base text-ink">{label}</p>
          <p className="text-xs text-ink-muted">
            Due {dueDate}
            {overdue ? <span className="text-warn"> · overdue</span> : ''}
            {galleryUrl ? ' · gallery link saved' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink">{STATUS_LABEL[status] ?? status}</span>
          {/* The accessible name names the deliverable, so a screen reader user knows which row
              this button belongs to rather than hearing "Update" four times. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${editing ? 'Cancel editing' : 'Update'} ${label}`}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? 'Cancel' : 'Update'}
          </Button>
        </div>
      </div>

      {editing ? (
        <form action={action} className="mt-3 flex flex-col gap-2 rounded border border-line bg-paper p-3">
          {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="deliverableId" value={id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select name="status" defaultValue={status} aria-label={`Status for ${label}`}>
              <option value="PENDING">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <TextInput
              name="galleryUrl"
              defaultValue={galleryUrl ?? ''}
              placeholder="Gallery link"
              aria-label={`Gallery link for ${label}`}
            />
          </div>
          <Button type="submit" size="sm" loading={pending} aria-label={`Save ${label}`}>
            Save
          </Button>
        </form>
      ) : null}
    </div>
  )
}
