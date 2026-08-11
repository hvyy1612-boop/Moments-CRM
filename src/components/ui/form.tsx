import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const controlBase =
  'w-full rounded border bg-surface px-3 text-base text-ink placeholder:text-ink-muted ' +
  'outline-none transition-colors duration-150 ' +
  'focus:border-accent focus:ring-1 focus:ring-accent ' +
  'disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-muted'

function borderFor(hasError: boolean): string {
  return hasError ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line'
}

/** Field wraps a control with a label, an optional hint, and an inline error message. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5" data-described={describedBy}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
export function TextInput({ hasError = false, className, ...rest }: InputProps) {
  return <input className={`${controlBase} h-10 ${borderFor(hasError)} ${className ?? ''}`} {...rest} />
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
export function Textarea({ hasError = false, className, ...rest }: TextareaProps) {
  return (
    <textarea className={`${controlBase} py-2 ${borderFor(hasError)} ${className ?? ''}`} rows={4} {...rest} />
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }
export function Select({ hasError = false, className, children, ...rest }: SelectProps) {
  return (
    <select className={`${controlBase} h-10 ${borderFor(hasError)} ${className ?? ''}`} {...rest}>
      {children}
    </select>
  )
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }
export function Checkbox({ label, id, className, ...rest }: CheckboxProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-base text-ink">
      <input
        id={id}
        type="checkbox"
        className={`mt-0.5 h-4 w-4 rounded-sm border border-line text-accent accent-accent focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${className ?? ''}`}
        {...rest}
      />
      <span>{label}</span>
    </label>
  )
}

/** Small uppercase caption used above grouped fields. */
export function FieldGroupLabel(props: LabelHTMLAttributes<HTMLElement>) {
  const { className, ...rest } = props
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-wide text-ink-muted ${className ?? ''}`}
      {...rest}
    />
  )
}
