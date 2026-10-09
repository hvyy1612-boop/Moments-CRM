'use client'

import { useOptimistic, useRef, useTransition } from 'react'
import type { EnqTaskRow } from '@/features/enquiries/workflow'
import { deleteEnquiryTaskAction, moveEnquiryTaskAction, toggleWorkItemAction } from '../actions'
import { AttentionDot, OwnerCell, StatusBadge, TaskTypeTag } from '../../jobs/[id]/EditableTaskRow'
import { IconMore } from '../../jobs/[id]/icons'

// Fixed workflow row grid: checkbox | Task | Due date | Owner | Status | action. Task is the one flexible
// column (1fr); Due date / Owner / Status get steady em widths (Owner wide enough for a full staff name)
// and the action a narrow fixed track. Due date, Owner and Status are CENTERED in their columns (header +
// content) per the approved layout. Header and every row share these exact tracks via subgrid, with the
// same side and vertical padding.
export const LEADS_PHASE_GRID =
  'grid grid-cols-[2.25em_minmax(0,1fr)_10em_11.5em_8.5em_2.75em] items-center'
export const LEADS_ROW = 'col-span-full grid grid-cols-subgrid items-center gap-x-6 border-l-2 px-4 py-3'

const menuItem = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

/** A task's stored due time (Sydney-local "HH:MM:SS", e.g. "15:00:00") shown as "3:00 pm".
 *  Returns null when there is no time, so the row shows the date alone. */
function formatDueTime(hms: string | undefined): string | null {
  if (!hms) return null
  const parts = hms.split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const period = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

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
  dueTime,
}: {
  task: EnqTaskRow
  enquiryId: string
  csrf: string
  onEdit: () => void
  /** The task's stored due time as Sydney-local "HH:MM:SS" (from dueAt), or undefined. */
  dueTime?: string
}) {
  const [done, setDone] = useOptimistic(task.done)
  const [, startTransition] = useTransition()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const attention = task.dueTone !== null && !done
  // Show the time only when the task actually has a due date; a bare time with no date makes no sense.
  const timeLabel = task.dueLabel ? formatDueTime(dueTime) : null
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
        data-write="lock"
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
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-base font-medium ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</span>
          <TaskTypeTag label={task.typeLabel} />
          {attention ? <AttentionDot /> : null}
        </div>
        {task.note ? <span className="mt-0.5 block truncate text-sm text-muted">{task.note}</span> : null}
        {task.blocked && !done ? <span className="block text-xs text-muted">Waiting for {task.blockedBy}</span> : null}
        {done && task.completedByName ? <span className="block text-xs text-muted">Done by {task.completedByName}</span> : null}
      </div>

      {/* Due date (centered), with the stored time on a second line below it when the task has one */}
      <div className="text-center text-sm">
        <div className={`whitespace-nowrap ${attention ? 'font-bold text-danger' : task.dueLabel ? 'text-ink-muted' : 'text-muted'}`}>
          {task.dueLabel ?? (task.noDate ? 'No date' : '-')}
        </div>
        {timeLabel ? <div className="whitespace-nowrap text-xs text-muted">{timeLabel}</div> : null}
      </div>

      {/* Owner (centered) */}
      <div className="flex justify-center">
        <OwnerCell name={task.owner} />
      </div>

      {/* Status (centered) */}
      <div className="flex justify-center">
        <StatusBadge done={done} />
      </div>

      {/* Actions (kebab) */}
      <details ref={menuRef} className="relative justify-self-center">
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
