import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-2 rounded font-medium whitespace-nowrap ' +
  'transition-colors duration-150 outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

// Primary is ink, not the accent (D-12): the accent (dusty rose) is reserved for links, active state,
// focus ring, and small highlights, so the one strongest action per screen stands on its own.
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-surface hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line hover:bg-paper',
  danger: 'bg-danger text-surface hover:brightness-95',
  ghost: 'bg-transparent text-ink hover:bg-paper',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className ?? ''}`}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}
