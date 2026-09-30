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
  return hasError ? 'border-danger focus:border-danger focus:ring-danger' : 'border-ink'
}

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

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4${className ? ` ${className}` : ''}`}>{children}</div>
}

export function FormSection({ title, description, control, children }: { title: string; description?: string; control?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {control}
      </div>
      {children}
    </section>
  )
}

export function PageForm({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col${className ? ` ${className}` : ''}`}>{children}</div>
}

export function FormBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p> : null}
      </div>
      <div className="grid grid-cols-12 gap-x-8 gap-y-8 lg:col-span-8">{children}</div>
    </section>
  )
}

const CELL_SPAN = {
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
  5: 'sm:col-span-5',
  6: 'sm:col-span-6',
  7: 'sm:col-span-7',
  8: 'sm:col-span-8',
  12: 'sm:col-span-12',
} as const

export function FormCell({ span = 12, children }: { span?: keyof typeof CELL_SPAN; children: ReactNode }) {
  return <div className={`col-span-12 ${CELL_SPAN[span]}`}>{children}</div>
}

export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 pt-4 lg:grid-cols-12">
      <div className="flex flex-wrap items-center gap-3 lg:col-span-8 lg:col-start-5">{children}</div>
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

export function FieldGroupLabel(props: LabelHTMLAttributes<HTMLElement>) {
  const { className, ...rest } = props
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-wide text-ink-muted ${className ?? ''}`}
      {...rest}
    />
  )
}
