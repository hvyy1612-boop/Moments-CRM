'use client'

import { useState } from 'react'
import { parseTaskForm, type DueMode, type DueOption, type DueSpec, type TaskFormErrors } from '@/features/tasks/due'

// Shared by the lead and job workflow boards so a task's due date behaves identically on both: Studio
// Ninja's "No due date / Relative / Absolute (time optional)" for to-dos, and a required date + time for
// calendar items (extra shoots, appointments, the main shoot).

export type { TaskFormErrors } from '@/features/tasks/due'

export const taskInputBase =
  'h-9 w-full rounded border bg-surface px-2.5 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
export const taskBorderFor = (hasError: boolean) => (hasError ? 'border-danger' : 'border-line-strong')

/** The checks the server also runs, done in the browser so a missing field shows a red line the moment
 *  staff hit Save (Google/Facebook style) instead of a native tooltip. */
export function checkTaskForm(form: HTMLFormElement, opts: { anchors: readonly DueOption[]; calendarItem: boolean }): TaskFormErrors {
  const result = parseTaskForm(new FormData(form), opts)
  return result.ok ? {} : result.errors
}

/** Required date + time (hours, minutes and seconds): extra shoots, appointments and the main shoot. */
export function TaskDueDateTimeFields({
  dateDefault,
  timeDefault,
  errors,
  onClear,
}: {
  dateDefault?: string
  timeDefault?: string
  errors: TaskFormErrors
  onClear: (field: keyof TaskFormErrors) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name="dueMode" value="absolute" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">
          <span>Date <span className="text-danger">*</span></span>
          <input
            className={`${taskInputBase} max-w-40 ${taskBorderFor(Boolean(errors.date))}`}
            type="date"
            name="dueAt"
            defaultValue={dateDefault ?? ''}
            aria-label="Due date"
            onInput={() => onClear('date')}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">
          <span>Time <span className="text-danger">*</span></span>
          <input
            className={`${taskInputBase} max-w-48 ${taskBorderFor(Boolean(errors.time))}`}
            type="time"
            step={1}
            name="dueTime"
            defaultValue={timeDefault ?? ''}
            aria-label="Due time (hours, minutes, seconds)"
            onInput={() => onClear('time')}
          />
        </label>
      </div>
      {errors.date || errors.time ? <p className="text-sm text-danger">{errors.date ?? errors.time}</p> : null}
    </div>
  )
}

// The relative row's controls sit side by side, so they size to their content instead of the full width.
const inlineInput = taskInputBase.replace('w-full ', '')

const MODES: { value: DueMode; label: string; detail: string }[] = [
  { value: 'none', label: 'No due date', detail: 'Tick it when it is done.' },
  { value: 'relative', label: 'Relative', detail: 'Moves with the milestone.' },
  { value: 'absolute', label: 'Absolute', detail: 'A set date.' },
]

/**
 * "When is it due?" for a to-do: No due date / Relative (N days or weeks before/after a milestone) /
 * Absolute (a date, with "+ Add time" for an exact time). Submits dueMode, dueAmount, dueUnit,
 * dueAnchorRel, dueAt and dueTime (read by features/tasks/due parseTaskForm).
 */
export function TaskDueFields({
  anchors,
  initial,
  errors,
  onClear,
}: {
  anchors: readonly DueOption[]
  initial: DueSpec
  errors: TaskFormErrors
  onClear: (field: keyof TaskFormErrors) => void
}) {
  const [mode, setMode] = useState<DueMode>(initial.mode)
  const [showTime, setShowTime] = useState(Boolean(initial.time))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-muted">When is it due?</span>
      <div role="radiogroup" aria-label="When is it due" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {MODES.map((m) => {
          const checked = mode === m.value
          return (
            <label
              key={m.value}
              className={`flex cursor-pointer items-start gap-2 rounded border bg-surface px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                checked ? 'border-ink' : 'border-line hover:border-line-strong'
              }`}
            >
              <input
                type="radio"
                name="dueMode"
                value={m.value}
                checked={checked}
                onChange={() => {
                  setMode(m.value)
                  onClear('amount')
                  onClear('date')
                  onClear('time')
                }}
                className="mt-1 accent-ink"
              />
              <span className="min-w-0">
                <span className={`block text-sm font-bold ${checked ? 'text-ink' : 'text-ink-muted'}`}>{m.label}</span>
                <span className="block text-xs text-muted">{m.detail}</span>
              </span>
            </label>
          )
        })}
      </div>

      {mode === 'relative' ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span>Due</span>
            <input
              className={`${inlineInput} w-20 ${taskBorderFor(Boolean(errors.amount))}`}
              type="number"
              min={0}
              step={1}
              name="dueAmount"
              defaultValue={initial.amount ?? 7}
              aria-label="How many days or weeks"
              onInput={() => onClear('amount')}
            />
            <select className={`${inlineInput} w-28 border-line-strong`} name="dueUnit" defaultValue={initial.unit ?? 'days'} aria-label="Days or weeks">
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
            <select
              className={`${inlineInput} min-w-44 border-line-strong`}
              name="dueAnchorRel"
              defaultValue={initial.anchor ?? anchors[0]?.value}
              aria-label="Counted from"
            >
              {anchors.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          {errors.amount ? <p className="text-sm text-danger">{errors.amount}</p> : null}
        </div>
      ) : null}

      {mode === 'absolute' ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">
              <span>Date <span className="text-danger">*</span></span>
              <input
                className={`${taskInputBase} max-w-40 ${taskBorderFor(Boolean(errors.date))}`}
                type="date"
                name="dueAt"
                defaultValue={initial.date ?? ''}
                aria-label="Due date"
                onInput={() => onClear('date')}
              />
            </label>
            {showTime ? (
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                <span>Time</span>
                <span className="flex items-center gap-2">
                  <input
                    className={`${taskInputBase} max-w-48 ${taskBorderFor(Boolean(errors.time))}`}
                    type="time"
                    step={1}
                    name="dueTime"
                    defaultValue={initial.time ?? ''}
                    aria-label="Due time"
                    onInput={() => onClear('time')}
                  />
                  <button type="button" onClick={() => { setShowTime(false); onClear('time') }} className="whitespace-nowrap text-sm font-medium text-muted hover:text-ink">
                    Remove time
                  </button>
                </span>
              </label>
            ) : (
              <button type="button" onClick={() => setShowTime(true)} className="h-9 rounded border border-line-strong px-3 text-sm font-medium text-ink hover:bg-sunk">
                + Add time
              </button>
            )}
          </div>
          {errors.date || errors.time ? <p className="text-sm text-danger">{errors.date ?? errors.time}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
