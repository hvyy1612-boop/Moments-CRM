'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea, TextInput } from '@/components/ui/form'
import { addClientNoteAction, deleteClientNoteAction } from '../actions'

export type NoteView = { id: string; title: string | null; body: string; dateLabel: string; author: string | null }

/** Client Notes as a running list (add titled notes, delete) - Studio-Ninja style. */
export function ClientNotesList({ clientId, csrf, notes }: { clientId: string; csrf: string; notes: NoteView[] }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 && !adding ? <p className="text-sm text-ink-muted">No notes yet.</p> : null}

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-line bg-paper p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {n.title ? <p className="text-sm font-semibold text-ink">{n.title}</p> : null}
                  <p className="whitespace-pre-line text-sm text-ink">{n.body}</p>
                </div>
                <form action={deleteClientNoteAction}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="noteId" value={n.id} />
                  <button type="submit" aria-label="Delete note" className="shrink-0 rounded p-1 text-ink-muted hover:text-lost-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </form>
              </div>
              <p className="mt-1 text-xs text-muted">{n.dateLabel}{n.author ? ` · ${n.author}` : ''}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form action={addClientNoteAction} onSubmit={() => setAdding(false)} className="flex flex-col gap-2 rounded-md border border-line p-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="clientId" value={clientId} />
          <TextInput name="title" placeholder="Title (optional)" maxLength={150} />
          <Textarea name="body" placeholder="Write a note..." rows={3} maxLength={5000} required autoFocus />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Save note</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>+ Add note</Button>
        </div>
      )}
    </div>
  )
}
