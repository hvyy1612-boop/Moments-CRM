'use client'

import { useMemo, useState } from 'react'
import { Popover } from './Popover'
import { EnquiryRow, type EnquiryRowData } from './EnquiryRow'
import { AddEnquiryButton } from './AddEnquiryButton'

type TabKey = 'all' | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST'
const TABS: { key: TabKey; label: string; match: (s: string) => boolean }[] = [

  { key: 'all', label: 'All', match: (s) => s !== 'LOST' && s !== 'ARCHIVED' },
  { key: 'NEW', label: 'New', match: (s) => s === 'NEW' },
  { key: 'CONTACTED', label: 'In discussion', match: (s) => s === 'CONTACTED' },
  { key: 'QUALIFIED', label: 'Quoting', match: (s) => s === 'QUALIFIED' },
  { key: 'CONVERTED', label: 'Booked', match: (s) => s === 'CONVERTED' },
  { key: 'LOST', label: 'Cancelled', match: (s) => s === 'LOST' || s === 'ARCHIVED' },
]

type SortKey = 'waiting' | 'newest' | 'name'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'waiting', label: 'Oldest waiting' },
  { key: 'newest', label: 'Newest' },
  { key: 'name', label: 'Name A-Z' },
]

type WaitingKey = 'any' | 'STUDIO' | 'CLIENT'
const WAITING_FILTERS: { key: WaitingKey; label: string }[] = [
  { key: 'any', label: 'Anyone' },
  { key: 'STUDIO', label: 'Studio' },
  { key: 'CLIENT', label: 'Client' },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function EnquiriesList({ rows, csrf }: { rows: EnquiryRowData[]; csrf: string }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<TabKey>('all')
  const [sort, setSort] = useState<SortKey>('waiting')
  const [waiting, setWaiting] = useState<WaitingKey>('any')

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => [r.name, r.event].some((f) => f.toLowerCase().includes(needle)))
  }, [rows, q])

  const counts = useMemo(() => {
    const map: Record<TabKey, number> = { all: 0, NEW: 0, CONTACTED: 0, QUALIFIED: 0, CONVERTED: 0, LOST: 0 }
    for (const t of TABS) map[t.key] = searched.filter((r) => t.match(r.status)).length
    return map
  }, [searched])

  const visible = useMemo(() => {
    const activeTab = TABS.find((t) => t.key === tab)!
    let out = searched.filter((r) => activeTab.match(r.status))
    if (waiting !== 'any') out = out.filter((r) => r.waitingOn === waiting)
    out = [...out]

    if (tab === 'LOST') out.sort((a, b) => b.waitingMs - a.waitingMs)
    else if (sort === 'waiting') out.sort((a, b) => a.waitingMs - b.waitingMs)
    else if (sort === 'newest') out.sort((a, b) => b.createdMs - a.createdMs)
    else out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [searched, tab, waiting, sort])

  const sortLabel = SORTS.find((s) => s.key === sort)!.label

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">Studio</div>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold text-ink">Enquiries</h1>
          <p className="mt-1 text-sm text-ink-muted">Your sales pipeline - from first enquiry to booking. Booked leads stay here as a record and also open as a Job.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search enquiries"
              aria-label="Search enquiries"
              className="h-9 w-64 rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <AddEnquiryButton csrf={csrf} />
        </div>
      </div>

      {/* Stage tabs + toolbar */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
              >
                {t.label}
                <span className={`tabular rounded-full px-1.5 py-0.5 text-xs leading-none ${active ? 'bg-line text-ink-muted' : 'bg-sunk text-ink-muted'}`}>{counts[t.key]}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1">
          <Popover
            width={176}
            align="right"
            renderTrigger={({ ref, onClick }) => (
              <button ref={ref} type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-sunk ${waiting !== 'any' ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
                Filter
                {waiting !== 'any' ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
              </button>
            )}
          >
            {({ close }) => (
              <div className="flex flex-col">
                <div className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted">Waiting on</div>
                {WAITING_FILTERS.map((w) => (
                  <button key={w.key} type="button" onClick={() => { setWaiting(w.key); close() }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper ${waiting === w.key ? 'font-medium' : ''}`}>
                    <span>{w.label}</span>
                    {waiting === w.key ? <Dot /> : null}
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <Popover
            width={176}
            align="right"
            renderTrigger={({ ref, onClick }) => (
              <button ref={ref} type="button" onClick={onClick} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
                {sortLabel}
              </button>
            )}
          >
            {({ close }) => (
              <div className="flex flex-col">
                {SORTS.map((s) => (
                  <button key={s.key} type="button" onClick={() => { setSort(s.key); close() }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper ${sort === s.key ? 'font-medium' : ''}`}>
                    <span>{s.label}</span>
                    {sort === s.key ? <Dot /> : null}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">
          {q ? 'No enquiries match your search.' : 'No enquiries in this view yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-medium">Client</th>
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Stage</th>
                <th className="py-2 pr-4 font-medium">Waiting on</th>
                <th className="py-2 pr-4 font-medium">Shoot date</th>
                <th className="w-10 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <EnquiryRow key={row.id} row={row} csrf={csrf} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
}
