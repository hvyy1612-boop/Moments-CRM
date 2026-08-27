'use client'

import { useState } from 'react'
import { ADDABLE_TASK_TYPES, type EnqStage, type TaskType } from '@/features/enquiries/workflow'
import { addEnquiryTaskAction, updateEnquiryTaskAction } from '../actions'
import { EnquiryTaskRow } from './EnquiryTaskRow'

const PHASE: Record<string, { rail: string; label: string }> = {
  enquiry: { rail: 'bg-enquiry', label: 'text-enquiry-ink' },
  quote: { rail: 'bg-quote', label: 'text-quote-ink' },
  booked: { rail: 'bg-booked', label: 'text-booked-ink' },
}
const FALLBACK = { rail: 'bg-hold', label: 'text-hold-ink' }

const TYPE_BADGE: Record<TaskType, string> = {
  TODO: '',
  AUTO_EMAIL: 'bg-enquiry text-enquiry-ink',
  APPOINTMENT: 'bg-quote text-quote-ink',
  SHOOT: 'bg-delivered text-delivered-ink',
  AUTO: 'bg-paper text-muted',
}

const inputClass =
  'h-9 w-full rounded border border-line-strong bg-surface px-2.5 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function TypeTag({ label, type }: { label: string; type: TaskType }) {
  if (!label) return null
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${TYPE_BADGE[type]}`}>{label}</span>
}

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
                {stage.tasks.map((t) => {
                  if (!t.editable) {
                    // AUTO row: system-driven, read-only.
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-base ${t.done ? 'text-ink-muted' : 'text-ink'}`}>{t.title}</span>
                          <TypeTag label={t.typeLabel} type={t.type} />
                        </div>
                      </div>
                    )
                  }
                  return editingId === t.id ? (
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
                    <EnquiryTaskRow
                      key={t.id}
                      task={t}
                      enquiryId={enquiryId}
                      csrf={csrf}
                      onEdit={() => setEditingId(t.id)}
                    />
                  )
                })}

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
                    <div className="flex flex-wrap items-center gap-2">
                      <select className={`${inputClass} max-w-40`} name="type" defaultValue="TODO" aria-label="Task type">
                        {ADDABLE_TASK_TYPES.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input className={`${inputClass} max-w-40`} type="date" name="dueAt" aria-label="Due date" />
                      <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface">Add</button>
                      <button type="button" onClick={() => setAddingStage(null)} className="rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink">Cancel</button>
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
