'use client'

// Shared by the enquiry and job workflow boards so a task's required date + time behave identically
// on both. A task pinned to a day AND a time (hours/minutes/seconds) lands in the right calendar slot.

export type TaskFormErrors = { title?: string; date?: string; time?: string }

export const taskInputBase =
  'h-9 w-full rounded border bg-surface px-2.5 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
export const taskBorderFor = (hasError: boolean) => (hasError ? 'border-danger' : 'border-line-strong')

/** The required checks the server also runs, done in the browser so a blank starred field shows a red
 * line the moment staff hit Save (Google/Facebook style) instead of a native tooltip. */
export function checkTaskForm(form: HTMLFormElement): TaskFormErrors {
  const fd = new FormData(form)
  const errs: TaskFormErrors = {}
  if (!String(fd.get('title') ?? '').trim()) errs.title = 'Please enter a task name.'
  if (!String(fd.get('dueAt') ?? '').trim()) errs.date = 'Please choose a date.'
  if (!String(fd.get('dueTime') ?? '').trim()) errs.time = 'Please choose a time.'
  return errs
}

/** Required date + time (hours, minutes and seconds) for a task. */
export function TaskDueDateTimeFields({
  dateDefault,
  timeDefault,
  errors,
  onClear,
}: {
  dateDefault?: string
  timeDefault?: string
  errors: TaskFormErrors
  onClear: (field: 'date' | 'time') => void
}) {
  return (
    <div className="flex flex-col gap-1">
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
