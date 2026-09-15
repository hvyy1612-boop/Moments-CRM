'use client'

import { useOptimistic, useTransition } from 'react'
import { BlockedChip, ReminderChip } from '@/components/ui/WorkflowChips'
import type { EnqTaskRow, TaskType } from '@/features/enquiries/workflow'
import { deleteEnquiryTaskAction, moveEnquiryTaskAction, toggleWorkItemAction } from '../actions'

const TYPE_BADGE: Record<TaskType, string> = {
  TODO: '',
  AUTO_EMAIL: 'bg-enquiry text-enquiry-ink',
  APPOINTMENT: 'bg-quote text-quote-ink',
  SHOOT: 'bg-delivered text-delivered-ink',
  AUTO: 'bg-paper text-muted',
}

const iconBtn = 'rounded px-1.5 py-0.5 text-sm text-muted hover:text-ink'

function TypeTag({ label, type }: { label: string; type: TaskType }) {
  if (!label) return null
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${TYPE_BADGE[type]}`}>{label}</span>
}

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
    <div className="flex items-start gap-2 rounded-md border border-line px-3 py-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={done ? 'Reopen task' : 'Mark done'}
        aria-pressed={done}
        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border text-xs transition-colors ${
          done
            ? 'border-delivered-ink bg-delivered text-delivered-ink'
            : 'border-line-strong text-transparent hover:border-ink'
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-base ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</span>
          <TypeTag label={task.typeLabel} type={task.type} />
          {task.dueLabel ? (
            <span className="rounded bg-paper px-1.5 py-0.5 text-xs text-ink-muted">{task.dueLabel}</span>
          ) : null}
          {task.noDate ? (
            <span className="rounded bg-sunk px-1.5 py-0.5 text-xs text-muted">No date</span>
          ) : null}
          {!done ? <ReminderChip tone={task.dueTone} /> : null}
          {task.blocked ? <BlockedChip blockedBy={task.blockedBy} /> : null}
        </div>
        {task.note ? <div className="mt-0.5 text-sm text-muted">{task.note}</div> : null}
        {done && task.completedByName ? <div className="text-sm text-muted">Done by {task.completedByName}</div> : null}
      </div>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={onEdit} className={iconBtn}>
          Edit
        </button>
        <form action={moveEnquiryTaskAction} className="inline">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="workItemId" value={task.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" aria-label="Move up" className={iconBtn}>
            ↑
          </button>
        </form>
        <form action={moveEnquiryTaskAction} className="inline">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="workItemId" value={task.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" aria-label="Move down" className={iconBtn}>
            ↓
          </button>
        </form>
        <form action={deleteEnquiryTaskAction} className="inline">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="workItemId" value={task.id} />
          <button
            type="submit"
            aria-label="Delete task"
            className="rounded px-1.5 py-0.5 text-sm text-muted hover:text-lost-ink"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  )
}
