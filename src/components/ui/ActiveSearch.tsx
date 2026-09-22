'use client'

/**
 * The one active-search field for the whole app, shaped to the Carbon "Active search" pattern: a search
 * icon + placeholder (no visible label), a live text field, an X clear button, no Go/Search button, and
 * the result count always shown while searching (including "0 results"). Used by the shared DataTable
 * and by grouped views (Payments) so every list searches and reads identically.
 */
export function ActiveSearchField({
  value,
  onChange,
  placeholder = 'Search',
  resultCount,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** When set, shown as "N results" while the field has a query (Carbon: always display the count). */
  resultCount?: number
}) {
  const searching = value.trim().length > 0
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm transition-colors focus-within:border-accent">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
        />
        {value ? (
          <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="shrink-0 text-ink-muted hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        ) : null}
      </div>
      {searching && resultCount !== undefined ? (
        <span className="tabular text-sm text-ink-muted" role="status" aria-live="polite">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      ) : null}
    </div>
  )
}

/** Carbon "avoid dead ends": a no-matches state that suggests a next step and offers a Clear action. */
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
