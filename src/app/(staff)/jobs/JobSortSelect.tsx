'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'stage', label: 'Stage' },
  { value: 'client-asc', label: 'Client A-Z' },
] as const

export type JobSortValue = (typeof OPTIONS)[number]['value']
export const JOB_DEFAULT_SORT: JobSortValue = 'newest'

export function JobSortSelect({ value }: { value: JobSortValue }) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(next: string) {
    const p = new URLSearchParams(params.toString())
    if (next === JOB_DEFAULT_SORT) p.delete('sort')
    else p.set('sort', next)
    const qs = p.toString()
    router.push(qs ? `/jobs?${qs}` : '/jobs')
  }

  return (
    <label className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />
      </svg>
      <span className="sr-only">Sort jobs</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="cursor-pointer appearance-none bg-transparent pr-1 text-sm text-ink-muted outline-none focus-visible:text-ink" aria-label="Sort jobs">
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="text-ink">{o.label}</option>
        ))}
      </select>
    </label>
  )
}
