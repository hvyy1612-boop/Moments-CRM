'use client'

import { useState } from 'react'
import { ADDABLE_TASK_TYPES, type BoardStage, type TaskType } from '@/features/projects/workflow'
import { WorkflowProgress } from '@/components/WorkflowProgress'
import { ReminderChip } from '@/components/ui/WorkflowChips'
import {
  checkTaskForm,
  TaskDueDateTimeFields,
  taskBorderFor,
  taskInputBase,
  taskInputClass,
  type TaskFormErrors,
} from '@/components/ui/TaskDateTimeFields'
import {
  addProjectStageBlockAction,
  addProjectTaskAction,
  updateProjectTaskAction,
} from '../actions'
import { EditableTaskRow } from './EditableTaskRow'

const PHASE: Record<string, { rail: string; label: string }> = {
  enquiry: { rail: 'bg-enquiry', label: 'text-enquiry-ink' },
  quote: { rail: 'bg-quote', label: 'text-quote-ink' },
  booked: { rail: 'bg-booked', label: 'text-booked-ink' },
  editing: { rail: 'bg-editing', label: 'text-editing-ink' },
  delivered: { rail: 'bg-delivered', label: 'text-delivered-ink' },
}
const FALLBACK = { rail: 'bg-hold', label: 'text-hold-ink' }

const TYPE_BADGE: Record<TaskType, string> = {
  TODO: '',
  AUTO_EMAIL: 'bg-enquiry text-enquiry-ink',
  APPOINTMENT: 'bg-quote text-quote-ink',
  SHOOT: 'bg-delivered text-delivered-ink',
  AUTO: 'bg-paper text-muted',
}

function TypeTag({ label, type }: { label: string; type: TaskType }) {
  if (!label) return null
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${TYPE_BADGE[type]}`}>{label}</span>
}

export function ProjectWorkflow({
  stages,
  allDone,
  projectId,
  csrf,
  taskTimes = {},
}: {
  stages: BoardStage[]
  allDone: boolean
  projectId: string
  csrf: string
  taskTimes?: Record<string, string>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState<string | null>(null)
  const [addStageOpen, setAddStageOpen] = useState(false)
  const [editErrors, setEditErrors] = useState<TaskFormErrors>({})
  const [addErrors, setAddErrors] = useState<TaskFormErrors>({})
  const clearEdit = (field: keyof TaskFormErrors) =>
    setEditErrors((p) => (p[field] ? { ...p, [field]: undefined } : p))
  const clearAdd = (field: keyof TaskFormErrors) =>
    setAddErrors((p) => (p[field] ? { ...p, [field]: undefined } : p))

  const allTasks = stages.flatMap((s) => s.tasks)
  // Overall progress + "next" reflect MANUAL staff work only; read-only system milestones don't count.
  const manualTasks = allTasks.filter((t) => t.editable)
  const nowStage = stages.find((s) => s.active) ?? null
  const nextTask = nowStage?.tasks.find((t) => t.editable && !t.done) ?? manualTasks.find((t) => !t.done) ?? null
  // Optional stages with no tasks stay hidden so the board only shows groups that hold real work;
  // they can be switched on from the "Add a stage" control below.
  const visibleStages = stages.filter((s) => !(s.optional && s.total === 0))
  const hiddenStages = stages.filter((s) => s.optional && s.total === 0)

  return (
    <div className="flex flex-col gap-5">
      <WorkflowProgress
        done={manualTasks.filter((t) => t.done).length}
        total={manualTasks.length}
        nowLabel={allDone ? null : (nowStage?.label ?? null)}
        nextTitle={allDone ? null : (nextTask?.title ?? null)}
      />
      {visibleStages.map((stage) => {
        const cls = PHASE[stage.color] ?? FALLBACK
        return (
          <div key={stage.key} className="flex gap-3">
            <div className={`w-1 shrink-0 rounded ${cls.rail}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${cls.label}`}>{stage.label}</span>
                {stage.optional ? <span className="text-xs text-muted">(optional)</span> : null}
                {stage.active && !allDone ? (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">Now</span>
                ) : null}
                {stage.total > 0 && stage.done === stage.total ? (
                  <span className="rounded bg-delivered px-1.5 py-0.5 text-xs font-bold text-delivered-ink">Complete</span>
                ) : null}
                {stage.total > 0 ? (
                  <span className="tabular ml-auto text-xs text-muted">
                    {stage.done}/{stage.total}
                  </span>
                ) : null}
              </div>
              {stage.total > 0 ? (
                <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-sunk">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${Math.round((stage.done / stage.total) * 100)}%` }}
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                {stage.tasks.map((t) => {
                  if (!t.editable) {
                    return (
                      <div key={t.id} className="flex items-start gap-2 rounded-md border border-line bg-paper px-3 py-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                            t.done ? 'border-delivered-ink bg-delivered text-delivered-ink' : 'border-line-strong text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-base ${t.done ? 'text-ink-muted' : 'text-ink'}`}>{t.title}</span>
                            <TypeTag label={t.typeLabel} type={t.type} />
                            <span className="text-xs text-muted">System</span>
                            {t.dueLabel ? (
                              <span className="rounded bg-paper px-1.5 py-0.5 text-xs text-ink-muted">{t.dueLabel}</span>
                            ) : null}
                            {t.noDate ? (
                              <span className="rounded bg-sunk px-1.5 py-0.5 text-xs text-muted">No date</span>
                            ) : null}
                            {!t.done ? <ReminderChip tone={t.dueTone} /> : null}
                          </div>
                          {t.note ? <div className="mt-0.5 text-sm text-muted">{t.note}</div> : null}
                        </div>
                      </div>
                    )
                  }
                  return editingId === t.id ? (
                    <form
                      key={t.id}
                      action={updateProjectTaskAction}
                      noValidate
                      onSubmit={(e) => {
                        const errs = checkTaskForm(e.currentTarget)
                        if (errs.title || errs.date || errs.time) {
                          e.preventDefault()
                          setEditErrors(errs)
                          return
                        }
                        setEditErrors({})
                        setEditingId(null)
                      }}
                      className="flex flex-col gap-2 rounded-md border border-accent bg-paper p-3"
                    >
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="workItemId" value={t.id} />
                      <div className="flex flex-col gap-1">
                        <input
                          className={`${taskInputBase} ${taskBorderFor(Boolean(editErrors.title))}`}
                          name="title"
                          defaultValue={t.title}
                          aria-label="Task title"
                          onInput={() => clearEdit('title')}
                        />
                        {editErrors.title ? <p className="text-sm text-danger">{editErrors.title}</p> : null}
                      </div>
                      <TaskDueDateTimeFields
                        dateDefault={t.dueValue ?? ''}
                        timeDefault={taskTimes[t.id] ?? ''}
                        errors={editErrors}
                        onClear={clearEdit}
                      />
                      <div className="flex items-center gap-2">
                        <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Save</button>
                        <button type="button" onClick={() => { setEditErrors({}); setEditingId(null) }} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <EditableTaskRow
                      key={t.id}
                      task={t}
                      projectId={projectId}
                      csrf={csrf}
                      onEdit={() => { setEditErrors({}); setEditingId(t.id) }}
                    />
                  )
                })}

                {stage.optional && stage.tasks.length === 0 ? (
                  <form action={addProjectStageBlockAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="stage" value={stage.key} />
                    <button
                      type="submit"
                      className="self-start rounded border border-line-strong px-2.5 py-1 text-sm font-bold text-ink-muted hover:text-ink"
                    >
                      + Add {stage.label} tasks
                    </button>
                  </form>
                ) : null}

                {addingStage === stage.key ? (
                  <form
                    action={addProjectTaskAction}
                    noValidate
                    onSubmit={(e) => {
                      const errs = checkTaskForm(e.currentTarget)
                      if (errs.title || errs.date || errs.time) {
                        e.preventDefault()
                        setAddErrors(errs)
                        return
                      }
                      setAddErrors({})
                      setAddingStage(null)
                    }}
                    className="flex flex-col gap-2 rounded-md border border-accent bg-paper p-3"
                  >
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="stage" value={stage.key} />
                    <div className="flex flex-col gap-1">
                      <input
                        className={`${taskInputBase} ${taskBorderFor(Boolean(addErrors.title))}`}
                        name="title"
                        placeholder="New task"
                        autoFocus
                        aria-label="Task title"
                        onInput={() => clearAdd('title')}
                      />
                      {addErrors.title ? <p className="text-sm text-danger">{addErrors.title}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                        <span>Type</span>
                        <select className={`${taskInputClass} max-w-40`} name="type" defaultValue="TODO" aria-label="Task type">
                          {ADDABLE_TASK_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TaskDueDateTimeFields errors={addErrors} onClear={clearAdd} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Add</button>
                      <button type="button" onClick={() => { setAddErrors({}); setAddingStage(null) }} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddErrors({}); setAddingStage(stage.key) }}
                    className="self-start rounded px-1 py-1 text-sm font-bold text-accent-ink hover:underline"
                  >
                    + Add task
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {hiddenStages.length > 0 ? (
        addStageOpen ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper p-3">
            <span className="text-sm text-ink-muted">Add a stage:</span>
            {hiddenStages.map((s) => (
              <form key={s.key} action={addProjectStageBlockAction} onSubmit={() => setAddStageOpen(false)}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="stage" value={s.key} />
                <button type="submit" className="rounded border border-line-strong px-2.5 py-1 text-sm font-bold text-ink-muted hover:text-ink">
                  {s.label}
                </button>
              </form>
            ))}
            <button type="button" onClick={() => setAddStageOpen(false)} className="text-sm font-bold text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddStageOpen(true)}
            className="self-start rounded px-1 py-1 text-sm font-bold text-accent-ink hover:underline"
          >
            + Add a stage
          </button>
        )
      ) : null}
    </div>
  )
}
