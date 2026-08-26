'use client'

import { useState } from 'react'
import type { EnqStage } from '@/features/enquiries/workflow'
import {
  addEnquiryTaskAction,
  deleteEnquiryTaskAction,
  moveEnquiryTaskAction,
  toggleWorkItemAction,
  updateEnquiryTaskAction,
} from '../actions'

const PHASE: Record<string, { rail: string; label: string }> = {
  enquiry: { rail: 'bg-enquiry', label: 'text-enquiry-ink' },
  quote: { rail: 'bg-quote', label: 'text-quote-ink' },
  booked: { rail: 'bg-booked', label: 'text-booked-ink' },
}
const FALLBACK = { rail: 'bg-hold', label: 'text-hold-ink' }

const inputClass =
  'h-9 w-full rounded border border-line-strong bg-surface px-2.5 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const iconBtn = 'rounded px-1.5 py-0.5 text-sm text-muted hover:text-ink'

export function EnquiryWorkflow({
  stages,
  allDone,
  enquiryId,
  csrf,
}: {
  stages: EnqStage[]
  allDone: boolean
  enquiryId: string
  csrf: string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-5">
      {stages.map((stage) => {
        const cls = PHASE[stage.color] ?? FALLBACK
        return (
          <div key={stage.key} className="flex gap-3">
            <div className={`w-1 shrink-0 rounded ${cls.rail}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${cls.label}`}>{stage.label}</span>
                {stage.active && !allDone ? (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">Now</span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                {stage.tasks.map((t) =>
                  editingId === t.id ? (
                    <form
                      key={t.id}
                      action={updateEnquiryTaskAction}
                      onSubmit={() => setEditingId(null)}
                      className="flex flex-col gap-2 rounded-md border border-accent bg-paper p-3"
                    >
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="enquiryId" value={enquiryId} />
                      <input type="hidden" name="workItemId" value={t.id} />
                      <input className={inputClass} name="title" defaultValue={t.title} required aria-label="Task title" />
                      <div className="flex items-center gap-2">
                        <input className={`${inputClass} max-w-40`} type="date" name="dueAt" defaultValue={t.dueValue ?? ''} aria-label="Due date" />
                        <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div key={t.id} className="flex items-start gap-2 rounded-md border border-line px-3 py-2">
                      <form action={toggleWorkItemAction} className="mt-0.5">
                        <input type="hidden" name="csrf" value={csrf} />
                        <input type="hidden" name="enquiryId" value={enquiryId} />
                        <input type="hidden" name="workItemId" value={t.id} />
                        <button
                          type="submit"
                          aria-label={t.done ? 'Reopen task' : 'Mark done'}
                          className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                            t.done ? 'border-delivered-ink bg-delivered text-delivered-ink' : 'border-line-strong text-transparent hover:border-ink'
                          }`}
                        >
                          ✓
                        </button>
                      </form>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-base ${t.done ? 'text-ink-muted line-through' : 'text-ink'}`}>{t.title}</span>
                          {t.dueLabel ? (
                            <span className="rounded bg-paper px-1.5 py-0.5 text-xs text-ink-muted">{t.dueLabel}</span>
                          ) : null}
                        </div>
                        {t.done && t.completedByName ? (
                          <div className="text-sm text-muted">Done by {t.completedByName}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button type="button" onClick={() => setEditingId(t.id)} className={iconBtn}>
                          Edit
                        </button>
                        <form action={moveEnquiryTaskAction} className="inline">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="enquiryId" value={enquiryId} />
                          <input type="hidden" name="workItemId" value={t.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button type="submit" aria-label="Move up" className={iconBtn}>
                            ↑
                          </button>
                        </form>
                        <form action={moveEnquiryTaskAction} className="inline">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="enquiryId" value={enquiryId} />
                          <input type="hidden" name="workItemId" value={t.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button type="submit" aria-label="Move down" className={iconBtn}>
                            ↓
                          </button>
                        </form>
                        <form action={deleteEnquiryTaskAction} className="inline">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="enquiryId" value={enquiryId} />
                          <input type="hidden" name="workItemId" value={t.id} />
                          <button type="submit" aria-label="Delete task" className="rounded px-1.5 py-0.5 text-sm text-muted hover:text-lost-ink">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  ),
                )}

                {addingStage === stage.key ? (
                  <form
                    action={addEnquiryTaskAction}
                    onSubmit={() => setAddingStage(null)}
                    className="flex flex-col gap-2 rounded-md border border-accent bg-paper p-3"
                  >
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiryId} />
                    <input type="hidden" name="stage" value={stage.key} />
                    <input className={inputClass} name="title" placeholder="New task" required autoFocus aria-label="Task title" />
                    <div className="flex items-center gap-2">
                      <input className={`${inputClass} max-w-40`} type="date" name="dueAt" aria-label="Due date" />
                      <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">
                        Add
                      </button>
                      <button type="button" onClick={() => setAddingStage(null)} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingStage(stage.key)}
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
    </div>
  )
}
