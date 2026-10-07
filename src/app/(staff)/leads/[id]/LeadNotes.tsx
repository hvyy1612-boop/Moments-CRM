'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/form'
import { IconButton } from '@/components/ui/IconButton'
import { addEnquiryNoteAction } from '../actions'
import { SidebarCard } from './SidebarCard'

const PlusIcon = <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>

export type LeadNote = { id: string; body: string; at: string; by: string | null }

/**
 * The lead's internal Notes card (replaces the old Conversation panel). Notes are stored as internal
 * communications, so this is an append-only log with an add affordance (the "+" icon). Saving uses an
 * async form-action wrapper to close the composer only AFTER the server action fires (never unmounting
 * the form first).
 */
export function LeadNotes({ enquiryId, csrf, notes }: { enquiryId: string; csrf: string; notes: LeadNote[] }) {
  const [adding, setAdding] = useState(false)
  return (
    <SidebarCard
      title="Notes"
      action={!adding ? <IconButton label="Add note" data-write="hide" tone="accent" icon={PlusIcon} onClick={() => setAdding(true)} /> : undefined}
    >
      {adding ? (
        <form
          action={async (fd) => { await addEnquiryNoteAction(fd); setAdding(false) }}
          className="mb-3 flex flex-col gap-2"
        >
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <Textarea name="body" required rows={3} placeholder="Add an internal note about this lead..." autoFocus />
          <div className="flex items-center gap-2">
            <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Save note</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
          </div>
        </form>
      ) : null}
      {notes.length === 0 ? (
        <p className="text-sm text-ink-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
              <p className="whitespace-pre-line break-words text-sm text-ink">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{n.by ?? 'Staff'} · {n.at}</p>
            </li>
          ))}
        </ul>
      )}
    </SidebarCard>
  )
}
