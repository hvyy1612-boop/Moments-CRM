'use client'

import { useState } from 'react'
import { ADDABLE_TASK_TYPES, type EnqStage } from '@/features/enquiries/workflow'
import {
  checkTaskForm,
  TaskDueDateTimeFields,
  taskBorderFor,
  taskInputBase,
  taskInputClass,
  type TaskFormErrors,
} from '@/components/ui/TaskDateTimeFields'
import { addEnquiryTaskAction, updateEnquiryTaskAction } from '../actions'
import { EnquiryTaskRow, LEADS_PHASE_GRID, LEADS_ROW } from './EnquiryTaskRow'
import { AttentionDot, CheckBox, StatusBadge } from '../../jobs/[id]/EditableTaskRow'
import { IconChevron } from '../../jobs/[id]/icons'

type Filter = 'all' | 'pending' | 'attention'

/**
 * The lead workflow, built on the SAME UI as the Jobs workflow (ProjectWorkflow): a toolbar (filter +
 * show-completed), an attention banner, and numbered collapsible phase sections whose tasks sit in a
 * true column grid (Task | Due date | Status) with Done/Pending badges. The CONTENT is the lead's own
 * (its stages and tasks). A booked lead renders read-only (no toolbar, no editing) as a record.
 */
export function EnquiryWorkflow({
  stages,
  allDone,
  enquiryId,
  csrf,
  taskTimes = {},
  readOnly = false,
}: {
  stages: EnqStage[]
  allDone: boolean
  enquiryId: string
  csrf: string
  taskTimes?: Record<string, string>
  /** A booked lead: render the ticked checklist as a read-only record (no toggling, editing, adding). */
  readOnly?: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState<string | null>(null)
  const [editErrors, setEditErrors] = useState<TaskFormErrors>({})
  const [addErrors, setAddErrors] = useState<TaskFormErrors>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [showCompleted, setShowCompleted] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleCollapsed = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }))

  const clearEdit = (field: keyof TaskFormErrors) =>
    setEditErrors((p) => (p[field] ? { ...p, [field]: undefined } : p))
  const clearAdd = (field: keyof TaskFormErrors) =>
    setAddErrors((p) => (p[field] ? { ...p, [field]: undefined } : p))

  const allTasks = stages.flatMap((s) => s.tasks)
  const attentionCount = allTasks.filter((t) => !t.done && t.dueTone !== null).length

  const rowVisible = (done: boolean, attention: boolean) => {
    if (done && !showCompleted) return false
    if (filter === 'pending' && done) return false
    if (filter === 'attention' && !attention) return false
    return true
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Title + toolbar */}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Workflow</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              aria-label="Filter tasks"
              className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink"
            >
              <option value="all">All tasks</option>
              <option value="pending">Pending</option>
              <option value="attention">Needs attention</option>
            </select>
            <button
              type="button"
              role="switch"
              aria-checked={showCompleted}
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-2 text-sm text-ink-muted"
            >
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showCompleted ? 'bg-accent' : 'bg-line-strong'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-all ${showCompleted ? 'left-4' : 'left-0.5'}`} />
              </span>
              Show completed
            </button>
          </div>
        </div>
      )}

      {/* Attention banner */}
      {!readOnly && attentionCount > 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-danger bg-danger/5 px-4 py-3">
          <AttentionDot />
          <p className="text-sm text-ink">
            <span className="font-bold text-danger">Attention required.</span>{' '}
            You have {attentionCount} task{attentionCount === 1 ? '' : 's'} due soon or overdue. Please review to keep this lead moving.
          </p>
        </div>
      ) : null}

      {/* Phases */}
      {stages.map((stage, i) => {
        const isCollapsed = collapsed[stage.key]
        const rows = stage.tasks.filter((t) => rowVisible(t.done, t.dueTone !== null && !t.done))
        return (
          <section key={stage.key} className="rounded-md border border-line">
            <button
              type="button"
              onClick={() => toggleCollapsed(stage.key)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-3 rounded-t-md px-3 py-3 text-left hover:bg-paper"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-surface">
                {i + 1}
              </span>
              <span className="text-sm font-bold text-ink">{stage.label}</span>
              {stage.active && !allDone ? (
                <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">Now</span>
              ) : null}
              {stage.total > 0 ? (
                <span className="text-sm text-muted">{stage.done} / {stage.total} completed</span>
              ) : null}
              <IconChevron className={`ml-auto h-4 w-4 text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>

            {!isCollapsed ? (
              <div className="border-t border-line">
                {stage.total > 0 ? (
                  <div className={LEADS_PHASE_GRID}>
                    <div className={`${LEADS_ROW} border-transparent bg-paper text-xs font-bold uppercase tracking-wide text-muted`}>
                      <span />
                      <span>Task</span>
                      <span>Due date</span>
                      <span>Status</span>
                      <span />
                    </div>

                    {rows.length === 0 ? (
                      <div className="col-span-full px-3 py-3 text-sm text-muted">No matching tasks in this view.</div>
                    ) : (
                      rows.map((t) => {
                        if (!t.editable || readOnly) {
                          // An AUTO task, or a booked lead's read-only record: static, non-interactive.
                          return (
                            <div key={t.id} className={`${LEADS_ROW} border-transparent`}>
                              <CheckBox done={t.done} muted />
                              <div className="min-w-0">
                                <span className={`text-base ${t.done ? 'text-ink-muted' : 'text-ink'}`}>
                                  {t.title}
                                  {!t.editable ? <span className="text-xs text-muted"> (Auto)</span> : null}
                                </span>
                                {t.note ? <span className="block truncate text-sm text-muted">{t.note}</span> : null}
                              </div>
                              <div className="whitespace-nowrap text-sm text-muted">{t.dueLabel ?? (t.noDate ? 'No date' : '-')}</div>
                              <StatusBadge done={t.done} />
                              <span />
                            </div>
                          )
                        }
                        return editingId === t.id ? (
                          <form
                            key={t.id}
                            action={updateEnquiryTaskAction}
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
                            className="col-span-full flex flex-col gap-2 border-l-2 border-accent bg-paper p-3"
                          >
                            <input type="hidden" name="csrf" value={csrf} />
                            <input type="hidden" name="enquiryId" value={enquiryId} />
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
                          <EnquiryTaskRow
                            key={t.id}
                            task={t}
                            enquiryId={enquiryId}
                            csrf={csrf}
                            onEdit={() => { setEditErrors({}); setEditingId(t.id) }}
                          />
                        )
                      })
                    )}
                  </div>
                ) : null}

                {readOnly ? null : (
                  <div className="border-t border-line px-3 py-2">
                    {addingStage === stage.key ? (
                      <form
                        action={addEnquiryTaskAction}
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
                        <input type="hidden" name="enquiryId" value={enquiryId} />
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
                                <option key={o.value} value={o.value}>{o.label}</option>
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
                        className="rounded py-1 text-sm font-bold text-accent-ink hover:underline"
                      >
                        + Add task
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
