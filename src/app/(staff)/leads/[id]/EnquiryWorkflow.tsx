'use client'

import { useState, type ReactNode } from 'react'
import { LEAD_TASK_TYPES, type EnqStage, type TaskType } from '@/features/enquiries/workflow'
import { CALENDAR_TASK_TYPES, LEAD_DUE_ANCHORS, type DueSpec } from '@/features/tasks/due'
import { TASK_TITLE_PLACEHOLDER, TaskTypePicker } from '../../jobs/[id]/TaskTypePicker'
import {
  checkTaskForm,
  TaskDueDateTimeFields,
  TaskDueFields,
  taskBorderFor,
  taskInputBase,
  type TaskFormErrors,
} from '@/components/ui/TaskDateTimeFields'
import {
  addEnquiryStageAction,
  addEnquiryTaskAction,
  deleteEnquiryStageAction,
  renameEnquiryStageAction,
  updateEnquiryTaskAction,
} from '../actions'
import { EnquiryTaskRow, LEADS_PHASE_GRID, LEADS_ROW } from './EnquiryTaskRow'
import { AttentionDot, CheckBox, OwnerCell, StatusBadge } from '../../jobs/[id]/EditableTaskRow'
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
  taskDue = {},
  readOnly = false,
  muted = false,
  rail,
  footer,
}: {
  stages: EnqStage[]
  allDone: boolean
  enquiryId: string
  csrf: string
  taskTimes?: Record<string, string>
  /** Each task's stored due date, to pre-fill the edit form (features/tasks/due dueSpecOf). */
  taskDue?: Record<string, DueSpec>
  /** A booked lead: render the ticked checklist as a read-only record (no toggling, editing, adding). */
  readOnly?: boolean
  /** "Job complete" ticked: the sections show greyed out (Studio Ninja); untick it to work on them again. */
  muted?: boolean
  /** Cards in a fixed-width column on the right (client, quotes, invoices...). They start level with the
   *  first box of the workflow, not with its title row. */
  rail?: ReactNode
  /** Shown under the workflow, in the same column (the lead's outcome actions). */
  footer?: ReactNode
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState<string | null>(null)
  // What "+ Add task" is adding: a to-do, an appointment, or (on a job) an extra shoot.
  const [addType, setAddType] = useState<TaskType>('TODO')
  const [addingStageNew, setAddingStageNew] = useState(false)
  const [renamingStage, setRenamingStage] = useState<string | null>(null)
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
    // Row 1: the title + toolbar (left column only). Row 2: the workflow boxes (left) beside the rail
    // (right), so the rail's first card lines up with the first box, not with the title.
    <div className={`grid grid-cols-1 items-start gap-x-6 gap-y-4 ${rail ? 'lg:grid-cols-[minmax(0,1fr)_20em]' : ''}`}>
      {/* Title + toolbar */}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-start-1 lg:row-start-1">
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

      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-2">
        <div className={`flex min-w-0 flex-col gap-4 ${muted ? 'opacity-55' : ''}`}>
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
            <section key={stage.key} className="rounded-md border border-line-strong">
              {renamingStage === stage.key && !readOnly ? (
                <form
                  action={renameEnquiryStageAction}
                  onSubmit={(e) => {
                    if (!String(new FormData(e.currentTarget).get('toStage') ?? '').trim()) { e.preventDefault(); return }
                    setRenamingStage(null)
                  }}
                  className="flex flex-wrap items-center gap-2 px-4 py-3"
                >
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiryId} />
                  <input type="hidden" name="fromStage" value={stage.key} />
                  <input
                    name="toStage"
                    defaultValue={stage.label}
                    autoFocus
                    maxLength={50}
                    aria-label="Stage name"
                    className={`${taskInputBase} ${taskBorderFor(false)} min-w-0 flex-1`}
                  />
                  <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Save</button>
                  <button type="button" onClick={() => setRenamingStage(null)} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
                </form>
              ) : (
                <div className="flex w-full items-center gap-2 rounded-t-md px-4 py-3 hover:bg-paper">
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(stage.key)}
                    aria-expanded={!isCollapsed}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-surface">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-bold text-ink">{stage.label}</span>
                    {stage.active && !allDone ? (
                      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">Now</span>
                    ) : null}
                    {stage.total > 0 ? (
                      <span className="shrink-0 whitespace-nowrap text-sm text-muted">{stage.done} / {stage.total} completed</span>
                    ) : null}
                  </button>
                  {stage.custom && !readOnly ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" data-write="hide" onClick={() => setRenamingStage(stage.key)} aria-label="Rename stage" className="rounded p-1 text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
                      </button>
                      <form action={deleteEnquiryStageAction} onSubmit={(e) => { if (!window.confirm(`Delete the "${stage.label}" stage and its tasks?`)) e.preventDefault() }}>
                        <input type="hidden" name="csrf" value={csrf} />
                        <input type="hidden" name="enquiryId" value={enquiryId} />
                        <input type="hidden" name="stage" value={stage.key} />
                        <button type="submit" aria-label="Delete stage" className="rounded p-1 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                        </button>
                      </form>
                    </div>
                  ) : null}
                  <button type="button" onClick={() => toggleCollapsed(stage.key)} aria-label={isCollapsed ? 'Expand stage' : 'Collapse stage'} className="shrink-0 rounded p-1 text-muted hover:text-ink">
                    <IconChevron className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                </div>
              )}

              {!isCollapsed ? (
                <div className="border-t border-line">
                  {stage.total > 0 ? (
                    <div className={LEADS_PHASE_GRID}>
                      <div className={`${LEADS_ROW} border-transparent bg-paper text-xs font-medium uppercase tracking-wider text-muted`}>
                        <span />
                        <span>Task</span>
                        <span className="text-center">Due date</span>
                        <span className="text-center">Owner</span>
                        <span className="text-center">Status</span>
                        <span />
                      </div>

                      {rows.length === 0 ? (
                        <div className="col-span-full px-4 py-3 text-sm text-muted">No matching tasks in this view.</div>
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
                                <div className="whitespace-nowrap text-center text-sm text-muted">{t.dueLabel ?? (t.noDate ? 'No date' : '-')}</div>
                                <div className="flex justify-center"><OwnerCell name={t.owner} /></div>
                                <div className="flex justify-center"><StatusBadge done={t.done} /></div>
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
                                const errs = checkTaskForm(e.currentTarget, { anchors: LEAD_DUE_ANCHORS, calendarItem: CALENDAR_TASK_TYPES.has(t.type) })
                                if (Object.keys(errs).length > 0) {
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
                              {CALENDAR_TASK_TYPES.has(t.type) ? (
                                <TaskDueDateTimeFields
                                  dateDefault={t.dueValue ?? ''}
                                  timeDefault={taskTimes[t.id] ?? ''}
                                  errors={editErrors}
                                  onClear={clearEdit}
                                />
                              ) : (
                                <TaskDueFields anchors={LEAD_DUE_ANCHORS} initial={taskDue[t.id] ?? { mode: 'none' }} errors={editErrors} onClear={clearEdit} />
                              )}
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
                              dueTime={taskTimes[t.id]}
                              onEdit={() => { setEditErrors({}); setEditingId(t.id) }}
                            />
                          )
                        })
                      )}
                    </div>
                  ) : null}

                  {readOnly ? null : (
                    <div className="border-t border-line px-4 py-3">
                      {addingStage === stage.key ? (
                        <form
                          action={addEnquiryTaskAction}
                          noValidate
                          onSubmit={(e) => {
                            const errs = checkTaskForm(e.currentTarget, { anchors: LEAD_DUE_ANCHORS, calendarItem: addType !== 'TODO' })
                            if (Object.keys(errs).length > 0) {
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
                          <TaskTypePicker options={LEAD_TASK_TYPES} value={addType} onChange={setAddType} />
                          <div className="flex flex-col gap-1">
                            <input
                              className={`${taskInputBase} ${taskBorderFor(Boolean(addErrors.title))}`}
                              name="title"
                              placeholder={TASK_TITLE_PLACEHOLDER[addType] ?? 'New task'}
                              autoFocus
                              aria-label="Task title"
                              onInput={() => clearAdd('title')}
                            />
                            {addErrors.title ? <p className="text-sm text-danger">{addErrors.title}</p> : null}
                          </div>
                          <div>
                            {addType === 'TODO' ? (
                              <TaskDueFields key={`due-${stage.key}`} anchors={LEAD_DUE_ANCHORS} initial={{ mode: 'none' }} errors={addErrors} onClear={clearAdd} />
                            ) : (
                              <TaskDueDateTimeFields errors={addErrors} onClear={clearAdd} />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Add</button>
                            <button type="button" onClick={() => { setAddErrors({}); setAddingStage(null) }} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          data-write="hide"
                          onClick={() => { setAddErrors({}); setAddType('TODO'); setAddingStage(stage.key) }}
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

        {/* Add a per-lead custom stage (an extra workflow group). The core three stages stay fixed. */}
        {readOnly ? null : addingStageNew ? (
          <form
            action={addEnquiryStageAction}
            onSubmit={(e) => {
              if (!String(new FormData(e.currentTarget).get('stageName') ?? '').trim()) { e.preventDefault(); return }
              setAddingStageNew(false)
            }}
            className="flex flex-wrap items-center gap-2 rounded-md border border-accent bg-paper p-3"
          >
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <input
              name="stageName"
              placeholder="Stage name (e.g. Album design)"
              autoFocus
              maxLength={50}
              aria-label="Stage name"
              className={`${taskInputBase} ${taskBorderFor(false)} min-w-0 flex-1`}
            />
            <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Add stage</button>
            <button type="button" onClick={() => setAddingStageNew(false)} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
          </form>
        ) : (
          <button
            type="button"
            data-write="hide"
            onClick={() => setAddingStageNew(true)}
            className="self-start rounded py-1 text-sm font-bold text-accent-ink hover:underline"
          >
            + Add stage
          </button>
        )}
        </div>
        {footer}
      </div>

      {rail ? <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2">{rail}</aside> : null}
    </div>
  )
}
