'use client'

import { forwardRef, type KeyboardEvent } from 'react'

type Variant = 'global' | 'local'

const HEIGHT: Record<Variant, string> = { global: 'h-11', local: 'h-10' }

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

    ariaLabel?: string
    onFocus?: () => void

    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  }
>(function SearchField({ value, onChange, variant = 'local', placeholder = 'Search', ariaLabel, onFocus, onKeyDown }, ref) {
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {

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
