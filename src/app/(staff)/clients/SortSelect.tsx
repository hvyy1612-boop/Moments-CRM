'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const OPTIONS = [
  { value: 'newest', label: 'Newest client' },
  { value: 'oldest', label: 'Oldest client' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'most-jobs', label: 'Most jobs' },
  { value: 'fewest-jobs', label: 'Fewest jobs' },
] as const

export type SortValue = (typeof OPTIONS)[number]['value']
export const DEFAULT_SORT: SortValue = 'newest'

/** Quiet Sort control. Writes ?sort to the URL (keeps ?q), so list state survives navigation. */
export function SortSelect({ value }: { value: SortValue }) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(next: string) {
    const q = new URLSearchParams(params.toString())
    if (next === DEFAULT_SORT) q.delete('sort')
    else q.set('sort', next)
    const qs = q.toString()
    router.push(qs ? `/clients?${qs}` : '/clients')
  }

  return (
    <label className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />
      </svg>
      <span className="sr-only">Sort clients</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-sm text-ink-muted outline-none focus-visible:text-ink"
        aria-label="Sort clients"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
