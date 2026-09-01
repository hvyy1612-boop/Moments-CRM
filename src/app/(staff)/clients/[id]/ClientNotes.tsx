'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/form'
import { updateClientNotesAction } from '../actions'

export function ClientNotes({ clientId, notes, csrf }: { clientId: string; notes: string | null; csrf: string }) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <div>
        {notes ? (
          <p className="whitespace-pre-line text-base text-ink">{notes}</p>
        ) : (
          <p className="text-base text-ink-muted">No notes yet.</p>
        )}
        <button type="button" onClick={() => setEditing(true)} className="mt-3 text-sm font-bold text-accent hover:underline">
          {notes ? 'Edit note' : 'Add note'}
        </button>
      </div>
    )
  }

  return (
    <form action={updateClientNotesAction} onSubmit={() => setEditing(false)} className="flex flex-col gap-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="clientId" value={clientId} />
      <Textarea name="notes" defaultValue={notes ?? ''} rows={5} autoFocus placeholder="Add a note about this client..." />
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save note</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  )
}
