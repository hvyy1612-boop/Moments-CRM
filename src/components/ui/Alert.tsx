import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const stripe: Record<Tone, string> = {
  info: 'border-l-accent',
  success: 'border-l-ok',
  warning: 'border-l-warn',
  danger: 'border-l-danger',
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone
  title: string
  children?: ReactNode
}) {
  return (
    <div className={`rounded border border-line border-l-2 ${stripe[tone]} bg-surface p-3`} role="status">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children ? <p className="mt-0.5 text-sm text-ink-muted">{children}</p> : null}
    </div>
  )
}
