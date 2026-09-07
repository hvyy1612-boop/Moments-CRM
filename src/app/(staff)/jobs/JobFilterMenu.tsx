'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const TASKS: [string, string][] = [['', 'Any'], ['has', 'Has task'], ['none', 'No pending task']]
const selectClass = 'h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent'

/** Job filter: next-task state (the Active/Completed tabs handle the status split). Writes ?task, keeps ?q/?sort/?tab. */
export function JobFilterMenu({ task }: { task: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const active = Boolean(task)

  function set(key: string, value: string) {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    const qs = p.toString()
    router.push(qs ? `/jobs?${qs}` : '/jobs')
  }

  function clearAll() {
    const p = new URLSearchParams(params.toString())
    p.delete('task')
    const qs = p.toString()
    router.push(qs ? `/jobs?${qs}` : '/jobs')
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-sunk ${active ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        Filter
        {active ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-line bg-surface p-3 shadow-lg">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Next task
                <select value={task} onChange={(e) => set('task', e.target.value)} className={selectClass}>
                  {TASKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              {active ? (
                <button type="button" onClick={clearAll} className="mt-1 text-left text-sm text-accent-ink hover:underline">Clear filters</button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
