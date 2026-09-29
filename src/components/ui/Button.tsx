import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg' | 'xl'

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
  lg: 'h-12 px-6 text-base',
  // Prominent primary CTA (e.g. a modal's Save): taller + wider than Large so it clearly draws the eye.
  xl: 'h-14 px-8 text-base',
}

// A link (<a>/<Link>) that must read as a Large *secondary* Button inside a Carbon action group.
// Use this instead of putting a <Button> inside a <Link>: a <button> nested in an <a> is invalid HTML
// and the anchor then won't stretch, so a Save/Cancel pair renders unequal. Pair with flex-1 on the
// anchor (and on the sibling Button) to force two exactly-equal-width buttons regardless of label.
export const secondaryLinkLg =
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface ' +
  'px-6 text-base font-medium whitespace-nowrap text-ink outline-none transition-colors duration-150 ' +
  'hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent'

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
