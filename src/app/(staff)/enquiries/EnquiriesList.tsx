'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { PageContainer } from '@/components/PageContainer'
import { PageHeader } from '@/components/PageHeader'
import { COL } from '@/components/ui/tableColumns'
import { Popover } from './Popover'
import { StageControl } from './StageControl'
import { AddEnquiryButton } from './AddEnquiryButton'
import { EnquiryActionsCell, initials, waitingLabel, type EnquiryRowData } from './EnquiryRow'

// UI REDESIGN PHASE ONLY. Tabs / search / sort / filter operate on the already-loaded page data
// (visual filtering). None of them change enquiry stage, tasks, or any backend record.

type TabKey = 'all' | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST'
const TABS: { key: TabKey; label: string; match: (s: string) => boolean }[] = [
  // "All" is the working set - active phases + booked. Cancelled leads live only in their own tab so
  // they never clutter the pipeline.
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

export function EnquiriesList({ rows, csrf }: { rows: EnquiryRowData[]; csrf: string }) {
  const [tab, setTab] = useState<TabKey>('all')
  const [sort, setSort] = useState<SortKey>('waiting')
  const [waiting, setWaiting] = useState<WaitingKey>('any')

  // Tab counts are the totals per stage (the active-search field, owned by DataTable, filters WITHIN
  // the selected tab - matching the Jobs list).
  const counts = useMemo(() => {
    const map: Record<TabKey, number> = { all: 0, NEW: 0, CONTACTED: 0, QUALIFIED: 0, CONVERTED: 0, LOST: 0 }
    for (const t of TABS) map[t.key] = rows.filter((r) => t.match(r.status)).length
    return map
  }, [rows])

  const visible = useMemo(() => {
    const activeTab = TABS.find((t) => t.key === tab)!
    let out = rows.filter((r) => activeTab.match(r.status))
    if (waiting !== 'any') out = out.filter((r) => r.waitingOn === waiting)
    out = [...out]
    // Cancelled: newest cancellation on top (updatedAt = when it was cancelled), ignoring the sort control.
    if (tab === 'LOST') out.sort((a, b) => b.waitingMs - a.waitingMs)
    else if (sort === 'waiting') out.sort((a, b) => a.waitingMs - b.waitingMs)
    else if (sort === 'newest') out.sort((a, b) => b.createdMs - a.createdMs)
    else out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [rows, tab, waiting, sort])

  const sortLabel = SORTS.find((s) => s.key === sort)!.label

  const columns: DataColumn<EnquiryRowData>[] = [
    {
      key: 'client',
      header: 'Client',
      width: COL.flexHigh,
      cell: (r) => (
        <Link href={`/enquiries/${r.id}`} className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">{initials(r.name)}</span>
          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.name}</span>
        </Link>
      ),
    },
    { key: 'event', header: 'Event', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink-muted">{r.event}</span> },
    { key: 'stage', header: 'Stage', width: COL.content, cell: (r) => <StageControl enquiryId={r.id} status={r.status} csrf={csrf} /> },
    { key: 'waiting', header: 'Waiting on', width: COL.constrained, cell: (r) => <span className="text-ink-muted">{waitingLabel(r.waitingOn)}</span> },
    { key: 'shoot', header: 'Shoot date', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.shootDate ?? 'Not set'}</span> },
    { key: 'actions', header: '', width: COL.fixed, align: 'right', cell: (r) => <EnquiryActionsCell row={r} csrf={csrf} /> },
  ]

  return (
    <PageContainer variant="standard">
      <PageHeader
        eyebrow="Studio"
        title="Enquiries"
        description="Your sales pipeline - from first enquiry to booking. Booked leads stay here as a record and also open as a Job."
        actions={<AddEnquiryButton csrf={csrf} />}
      />

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
      <div className="mt-4">
        <DataTable
          ariaLabel="Enquiries"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          pageSize={30}
          search={(r) => `${r.name} ${r.event}`}
          searchPlaceholder="Search enquiries"
          emptyMessage="No enquiries in this view yet."
        />
      </div>
    </PageContainer>
  )
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
}
