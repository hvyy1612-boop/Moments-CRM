'use client'

import { forwardRef, type KeyboardEvent } from 'react'

/**
 * The ONE search field for the whole CRM. Every search - the global top-nav search and every in-table
 * local search - renders this so they share one anatomy: magnifier icon, input, and an X clear button
 * that appears only while there is a query (Carbon active-search rules; no Search/Go button). Esc clears
 * the query first, and only bubbles to the caller once the field is already empty (so a global search
 * can then close its panel). Consistency != identical: the two `variant`s share icon size, padding, gap,
 * radius, focus behaviour and clear button, and differ only by scope -> height + resting skin.
 *
 * Tokens live here as one set of Tailwind classes (the codebase's design tokens are Tailwind utilities,
 * not px CSS vars): height h-11/h-10, radius rounded-lg, icon h-4 w-4, px-3.5 gutter, gap-2.5.
 */
type Variant = 'global' | 'local'

const HEIGHT: Record<Variant, string> = { global: 'h-11', local: 'h-10' }
// Global = filled, borderless at rest (a header utility, not dominant); local = bordered surface, sitting
// on the table. Both share radius / padding / gap / focus ring language, differing only in the resting skin.
const SKIN: Record<Variant, string> = {
  global: 'bg-sunk focus-within:bg-surface focus-within:ring-1 focus-within:ring-line-strong',
  local: 'border border-line bg-surface focus-within:border-accent',
}

export const SearchField = forwardRef<
  HTMLInputElement,
  {
    value: string
    onChange: (value: string) => void
    variant?: Variant
    placeholder?: string
    /** Accessible name for the input (there is deliberately no visible label). Defaults to placeholder. */
    ariaLabel?: string
    onFocus?: () => void
    /** Extra key handling (arrows / Enter for the global panel). Esc-to-clear is handled here first. */
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  }
>(function SearchField({ value, onChange, variant = 'local', placeholder = 'Search', ariaLabel, onFocus, onKeyDown }, ref) {
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Carbon: Esc clears the query first; only when already empty does it bubble (caller may close a panel).
    if (e.key === 'Escape' && value) {
      e.preventDefault()
      onChange('')
      return
    }
    onKeyDown?.(e)
  }

  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-3.5 text-sm transition-colors ${HEIGHT[variant]} ${SKIN[variant]}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      ) : null}
    </div>
  )
})
