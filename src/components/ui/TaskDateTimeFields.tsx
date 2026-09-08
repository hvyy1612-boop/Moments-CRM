'use client'

export type TaskFormErrors = { title?: string; date?: string; time?: string }

export const taskInputBase =
  'h-9 w-full rounded border bg-surface px-2.5 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
export const taskInputClass = `${taskInputBase} border-line-strong`
export const taskBorderFor = (hasError: boolean) => (hasError ? 'border-danger' : 'border-line-strong')

export function checkTaskForm(form: HTMLFormElement): TaskFormErrors {
  const fd = new FormData(form)
  const errs: TaskFormErrors = {}
  if (!String(fd.get('title') ?? '').trim()) errs.title = 'Please enter a task name.'
  if (!String(fd.get('dueAt') ?? '').trim()) errs.date = 'Please choose a date.'
  if (!String(fd.get('dueTime') ?? '').trim()) errs.time = 'Please choose a time.'
  return errs
}

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
