'use client'

import { SearchField } from './SearchField'

export function ActiveSearchField({
  value,
  onChange,
  placeholder = 'Search',
  resultCount,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string

  resultCount?: number
}) {
  const searching = value.trim().length > 0
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="w-full max-w-sm">
        <SearchField value={value} onChange={onChange} variant="local" placeholder={placeholder} />
      </div>
      {searching && resultCount !== undefined ? (
        <span className="tabular text-sm text-ink-muted" role="status" aria-live="polite">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      ) : null}
    </div>
  )
}

export function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-ink-muted">
      <span>No matches for &ldquo;{query.trim()}&rdquo;. Try a different search.</span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 font-medium text-ink transition-colors hover:bg-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        Clear search
      </button>
    </div>
  )
}
