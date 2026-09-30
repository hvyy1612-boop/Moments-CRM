import Link from 'next/link'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'warn' | 'danger'

const SHELL =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-surface ' +
  'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent'

const TONE: Record<Tone, string> = {
  neutral: 'text-ink hover:bg-sunk',
  accent: 'text-accent-ink hover:bg-accent-tint',
  warn: 'text-warn hover:bg-warn/10 hover:border-warn/40',
  danger: 'text-danger hover:bg-danger/10 hover:border-danger/40',
}

function WithTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs font-medium text-surface opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 print:hidden"
      >
        {label}
      </span>
    </span>
  )
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {

  label: string
  icon: ReactNode
  tone?: Tone
}

export function IconButton({ label, icon, tone = 'neutral', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <WithTooltip label={label}>
      <button type={type} aria-label={label} className={`${SHELL} ${TONE[tone]} ${className ?? ''}`} {...rest}>
        {icon}
      </button>
    </WithTooltip>
  )
}

type IconLinkProps = Omit<ComponentProps<typeof Link>, 'children'> & {
  label: string
  icon: ReactNode
  tone?: Tone
}

export function IconLink({ label, icon, tone = 'neutral', className, ...rest }: IconLinkProps) {
  return (
    <WithTooltip label={label}>
      <Link aria-label={label} className={`${SHELL} ${TONE[tone]} ${className ?? ''}`} {...rest}>
        {icon}
      </Link>
    </WithTooltip>
  )
}
