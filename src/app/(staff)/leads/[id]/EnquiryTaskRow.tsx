'use client'

import { useOptimistic, useRef, useTransition } from 'react'
import type { EnqTaskRow } from '@/features/enquiries/workflow'
import { deleteEnquiryTaskAction, moveEnquiryTaskAction, toggleWorkItemAction } from '../actions'
import { AttentionDot, StatusBadge } from '../../jobs/[id]/EditableTaskRow'
import { IconMore } from '../../jobs/[id]/icons'

// One shared column grid so the phase header and every row line up in true columns
// (checkbox | Task | Due date | Status | actions), mirroring the Jobs workflow. Leads have no task owner,
// so that column is dropped. Task flexes (widest); Due date + Status get defined em widths (not
// max-content) so they read as one compact, evenly-spaced metadata cluster instead of drifting apart.
// Each row re-uses the tracks with subgrid.
export const LEADS_PHASE_GRID =
  'grid grid-cols-[max-content_minmax(0,1fr)_6.5em_5.75em_2.75em] items-center'
export const LEADS_ROW = 'col-span-full grid grid-cols-subgrid items-center gap-x-6 border-l-2 px-3 py-2.5'

const menuItem = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

/**
 * A single editable lead task, laid out as a table row (subgrid) exactly like the Jobs EditableTaskRow.
 * The tick is optimistic (React 19 useOptimistic): the checkbox and title flip instantly while the server
 * action runs. Reorder, edit and delete live in the per-row "..." menu. A task whose due date is near or
 * past (dueTone set) is flagged red - attention is shown on the row, never as a status.
 */
export function EnquiryTaskRow({
  task,
  enquiryId,
  csrf,
  onEdit,
}: {
  task: EnqTaskRow
  enquiryId: string
  csrf: string
  onEdit: () => void
}) {
  const [done, setDone] = useOptimistic(task.done)
  const [, startTransition] = useTransition()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const attention = task.dueTone !== null && !done
  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false }

  function toggle() {
    startTransition(async () => {
      setDone(!done)
      const data = new FormData()
      data.set('csrf', csrf)
      data.set('enquiryId', enquiryId)
      data.set('workItemId', task.id)
      await toggleWorkItemAction(data)
    })
  }

  return (
    <div className={`group ${LEADS_ROW} ${attention ? 'border-danger bg-danger/5' : 'border-transparent hover:bg-paper'}`}>
      {/* Checkbox */}
      <button
        type="button"
        onClick={toggle}
        aria-label={done ? 'Reopen task' : 'Mark done'}
        aria-pressed={done}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs transition-colors ${
          done ? 'border-ink bg-ink text-surface' : 'border-line-strong text-transparent hover:border-ink'
        }`}
      >
        ✓
      </button>

      {/* Task */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`truncate text-base ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</span>
          {attention ? <AttentionDot /> : null}
        </div>
        {task.note ? <span className="block truncate text-sm text-muted">{task.note}</span> : null}
        {task.blocked && !done ? <span className="block text-xs text-muted">Waiting for {task.blockedBy}</span> : null}
        {done && task.completedByName ? <span className="block text-xs text-muted">Done by {task.completedByName}</span> : null}
      </div>

      {/* Due date */}
      <div className={`whitespace-nowrap text-sm ${attention ? 'font-bold text-danger' : task.dueLabel ? 'text-ink-muted' : 'text-muted'}`}>
        {task.dueLabel ?? (task.noDate ? 'No date' : '-')}
      </div>

      {/* Status */}
      <StatusBadge done={done} />

      {/* Actions (kebab) */}
      <details ref={menuRef} className="relative justify-self-end">
        <summary
          className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded text-muted hover:bg-sunk hover:text-ink [&::-webkit-details-marker]:hidden"
          aria-label="Task actions"
        >
          <IconMore className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-sm">
          <button type="button" className={menuItem} onClick={() => { closeMenu(); onEdit() }}>Edit</button>
          <form action={moveEnquiryTaskAction} onSubmit={closeMenu}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <input type="hidden" name="workItemId" value={task.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" className={menuItem}>Move up</button>
          </form>
          <form action={moveEnquiryTaskAction} onSubmit={closeMenu}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <input type="hidden" name="workItemId" value={task.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" className={menuItem}>Move down</button>
          </form>
          <form action={deleteEnquiryTaskAction} onSubmit={closeMenu}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <input type="hidden" name="workItemId" value={task.id} />
            <button type="submit" className="block w-full px-3 py-2 text-left text-sm text-lost-ink hover:bg-paper">Delete</button>
          </form>
        </div>
      </details>
    </div>
  )
}
