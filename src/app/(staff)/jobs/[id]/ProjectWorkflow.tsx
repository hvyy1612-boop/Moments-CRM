'use client'

import { useState, type ReactNode } from 'react'
import { ADDABLE_TASK_TYPES, type ProjectBoard } from '@/features/projects/workflow'
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
  toggleProjectTaskAction,
  updateProjectTaskAction,
} from '../actions'
import { AttentionDot, CheckBox, EditableTaskRow, OwnerCell, PHASE_GRID, ROW, StatusBadge } from './EditableTaskRow'
import { HistoryLogModal, type HistoryEntry } from './HistoryLogModal'
import { IconCalendar, IconChevron, IconUser } from './icons'

type Filter = 'all' | 'pending' | 'attention'

export function ProjectWorkflow({
  board,
  projectId,
  csrf,
  taskTimes = {},
  history = [],
  rail,
}: {
  board: ProjectBoard
  projectId: string
  csrf: string
  taskTimes?: Record<string, string>
  history?: HistoryEntry[]
  /** Extra cards rendered in the right rail, under "Next action" (the job's Client / Notes / Team). */
  rail?: ReactNode
}) {
  const { stages, allDone, attentionCount, nextAction } = board

  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState<string | null>(null)
  const [addStageOpen, setAddStageOpen] = useState(false)
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

  const visibleStages = stages.filter((s) => !(s.optional && s.total === 0))
  const hiddenStages = stages.filter((s) => s.optional && s.total === 0)

  const rowVisible = (done: boolean, attention: boolean) => {
    if (done && !showCompleted) return false
    if (filter === 'pending' && done) return false
    if (filter === 'attention' && !attention) return false
    return true
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-8">
      {/* MAIN - 5/8 of the row */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
        {/* Title + toolbar */}
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
            <HistoryLogModal entries={history} />
          </div>
        </div>

        {/* Attention banner */}
        {attentionCount > 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-danger bg-danger/5 px-4 py-3">
            <AttentionDot />
            <p className="text-sm text-ink">
              <span className="font-bold text-danger">Attention required.</span>{' '}
              You have {attentionCount} task{attentionCount === 1 ? '' : 's'} due within 3 days or overdue. Please review and take action to keep this job on track.
            </p>
          </div>
        ) : null}

        {/* Phases */}
        {visibleStages.map((stage, i) => {
          const isCollapsed = collapsed[stage.key]
          const rows = stage.tasks.filter((t) => rowVisible(t.done, t.needsAttention && !t.done))
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
                {stage.optional ? <span className="text-xs text-muted">(optional)</span> : null}
                {stage.total > 0 ? (
                  <span className="text-sm text-muted">{stage.done} / {stage.total} completed</span>
                ) : null}
                <IconChevron className={`ml-auto h-4 w-4 text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>

              {!isCollapsed ? (
                <div className="border-t border-line">
                  {stage.total > 0 ? (
                    <div className={PHASE_GRID}>
                      <div className={`${ROW} border-transparent bg-paper text-xs font-bold uppercase tracking-wide text-muted`}>
                        <span />
                        <span>Task</span>
                        <span>Due date</span>
                        <span>Owner</span>
                        <span>Status</span>
                        <span />
                      </div>

                      {rows.length === 0 ? (
                        <div className="col-span-full px-3 py-3 text-sm text-muted">No matching tasks in this view.</div>
                      ) : (
                        rows.map((t) => {
                          if (t.isSystem) {
                            return (
                              <div key={t.id} className={`${ROW} border-transparent`}>
                                <CheckBox done={t.done} muted />
                                <div className="min-w-0">
                                  <span className={`text-base ${t.done ? 'text-ink-muted' : 'text-ink'}`}>
                                    {t.title} <span className="text-xs text-muted">(Auto)</span>
                                  </span>
                                  {t.note ? <span className="block truncate text-sm text-muted">{t.note}</span> : null}
                                </div>
                                <div className="whitespace-nowrap text-sm text-muted">{t.dueLabel ?? '-'}</div>
                                <OwnerCell name={t.owner ?? 'System'} system />
                                <StatusBadge done={t.done} />
                                <span />
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
                              className="col-span-full flex flex-col gap-2 border-l-2 border-accent bg-paper p-3"
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
                        })
                      )}
                    </div>
                  ) : null}

                  <div className="border-t border-line px-3 py-2">
                    {stage.optional && stage.tasks.length === 0 ? (
                      <form action={addProjectStageBlockAction}>
                        <input type="hidden" name="csrf" value={csrf} />
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="stage" value={stage.key} />
                        <button type="submit" className="rounded border border-line-strong px-2.5 py-1 text-sm font-bold text-ink-muted hover:text-ink">
                          + Add {stage.label} tasks
                        </button>
                      </form>
                    ) : addingStage === stage.key ? (
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
                </div>
              ) : null}
            </section>
          )
        })}

        {/* Add an optional stage */}
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
              <button type="button" onClick={() => setAddStageOpen(false)} className="text-sm font-bold text-muted hover:text-ink">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddStageOpen(true)} className="self-start rounded py-1 text-sm font-bold text-accent-ink hover:underline">
              + Add a stage
            </button>
          )
        ) : null}
      </div>

      {/* RAIL: Next action + the job's Client / Notes / Team cards (3/8 of the row) */}
      <aside className="flex flex-col gap-3 lg:col-span-3">
        <div className="rounded-md border border-line-strong bg-surface p-4">
          <div className="mb-3 text-sm font-bold text-ink">Next action</div>
          {allDone || !nextAction ? (
            <p className="text-sm text-ink-muted">All caught up - no task is waiting.</p>
          ) : nextAction.kind === 'task' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CheckBox done={false} />
                <span className={`text-base ${nextAction.needsAttention ? 'font-bold text-danger' : 'text-ink'}`}>{nextAction.title}</span>
                {nextAction.needsAttention ? <AttentionDot /> : null}
              </div>
              {nextAction.dueLabel ? (
                <div className={`flex items-center gap-1.5 text-sm ${nextAction.needsAttention ? 'font-bold text-danger' : 'text-ink-muted'}`}>
                  <IconCalendar className="h-4 w-4" /> Due {nextAction.dueLabel}
                </div>
              ) : null}
              {nextAction.owner ? (
                <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <IconUser className="h-4 w-4" /> {nextAction.owner}
                </div>
              ) : null}
              <form action={toggleProjectTaskAction} className="mt-1">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="workItemId" value={nextAction.taskId} />
                <button type="submit" className="w-full rounded-md bg-ink px-3 py-2 text-sm font-bold text-surface hover:opacity-90">
                  Mark as complete
                </button>
              </form>
            </div>
          ) : (
            <div className="text-sm text-ink">
              Waiting on <span className="font-bold">{nextAction.label}</span>
              <span className="mt-1 block text-sm text-muted">This updates automatically from records - no action needed.</span>
            </div>
          )}
        </div>
        {rail}
      </aside>
    </div>
  )
}
