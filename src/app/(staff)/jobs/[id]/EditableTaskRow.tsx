'use client'

import { useOptimistic, useRef, useTransition } from 'react'
import type { BoardTaskRow } from '@/features/projects/workflow'
import { deleteProjectTaskAction, moveProjectTaskAction, toggleProjectTaskAction } from '../actions'
import { IconMore, IconSystem, IconUser } from './icons'

export const PHASE_GRID =
  'grid grid-cols-[max-content_minmax(0,1fr)_6.5em_11.5em_5.75em_2.75em] items-center'
export const ROW = 'col-span-full grid grid-cols-subgrid items-center gap-x-6 border-l-2 px-3 py-2.5'

export function StatusBadge({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-flex min-w-20 justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
        done ? 'bg-ink text-surface' : 'border border-line-strong bg-surface text-ink-muted'
      }`}
    >
      {done ? 'Done' : 'Pending'}
    </span>
  )
}

export function AttentionDot() {
  return (
    <span
      aria-hidden="true"
      title="Needs attention"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-xs font-bold text-surface"
    >
      !
    </span>
  )
}

export function OwnerCell({ name, system = false }: { name: string | null; system?: boolean }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sunk text-ink-muted">
        {system ? <IconSystem className="h-3.5 w-3.5" /> : <IconUser className="h-3.5 w-3.5" />}
      </span>
      {name ?? (system ? 'System' : '-')}
    </div>
  )
}

export function TaskTypeTag({ label }: { label: string }) {
  if (!label) return null
  return <span className="shrink-0 whitespace-nowrap rounded-full bg-sunk px-2 py-0.5 text-xs font-medium text-ink-muted">{label}</span>
}

export function CheckBox({ done, muted = false }: { done: boolean; muted?: boolean }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
        done
          ? muted
            ? 'border-line-strong bg-sunk text-ink-muted'
            : 'border-ink bg-ink text-surface'
          : 'border-line-strong text-transparent'
      }`}
      aria-hidden="true"
    >
      ✓
    </span>
  )
}

const menuItem = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

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

export function EditableTaskRow({
  task,
  projectId,
  csrf,
  onEdit,
  dueTime,
}: {
  task: BoardTaskRow
  projectId: string
  csrf: string
  onEdit: () => void

  dueTime?: string
}) {
  const [done, setDone] = useOptimistic(task.done)
  const [, startTransition] = useTransition()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const attention = task.needsAttention && !done

  const timeLabel = task.dueLabel ? formatDueTime(dueTime) : null
  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false }

  function toggle() {
    startTransition(async () => {
      setDone(!done)
      const data = new FormData()
      data.set('csrf', csrf)
      data.set('projectId', projectId)
      data.set('workItemId', task.id)
      await toggleProjectTaskAction(data)
    })
  }

  return (
    <div
      className={`group ${ROW} ${
        attention ? 'border-danger bg-danger/5' : 'border-transparent hover:bg-paper'
      }`}
    >
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
        <div className="flex items-center gap-2">
          <span className={`truncate text-base ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</span>
          <TaskTypeTag label={task.typeLabel} />
          {attention ? <AttentionDot /> : null}
        </div>
        {task.note ? <span className="block truncate text-sm text-muted">{task.note}</span> : null}
        {task.blocked && !done ? <span className="block text-xs text-muted">Waiting for {task.blockedBy}</span> : null}
        {done && task.completedByName ? <span className="block text-xs text-muted">Done by {task.completedByName}</span> : null}
      </div>

      {/* Due date, with the stored time on a second line below it when the task has one */}
      <div className="text-sm">
        <div
          className={`whitespace-nowrap ${
            attention ? 'font-bold text-danger' : task.dueLabel ? 'text-ink-muted' : 'text-muted'
          }`}
        >
          {task.dueLabel ?? (task.noDate ? 'No date' : '-')}
        </div>
        {timeLabel ? <div className="whitespace-nowrap text-xs text-muted">{timeLabel}</div> : null}
      </div>

      {/* Owner */}
      <OwnerCell name={task.owner} />

      {/* Status */}
      <StatusBadge done={done} />

      {/* Actions (kebab) */}
      <details ref={menuRef} className="relative justify-self-center">
        <summary
          className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded text-muted hover:bg-sunk hover:text-ink [&::-webkit-details-marker]:hidden"
          aria-label="Task actions"
        >
          <IconMore className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-sm">
          {task.canEdit ? (
            <button type="button" className={menuItem} onClick={() => { closeMenu(); onEdit() }}>Edit</button>
          ) : null}
          <form action={moveProjectTaskAction} onSubmit={closeMenu}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="workItemId" value={task.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" className={menuItem}>Move up</button>
          </form>
          <form action={moveProjectTaskAction} onSubmit={closeMenu}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="workItemId" value={task.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" className={menuItem}>Move down</button>
          </form>
          {task.canDelete ? (
            <form action={deleteProjectTaskAction} onSubmit={closeMenu}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="workItemId" value={task.id} />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm text-lost-ink hover:bg-paper">Delete</button>
            </form>
          ) : null}
        </div>
      </details>
    </div>
  )
}
