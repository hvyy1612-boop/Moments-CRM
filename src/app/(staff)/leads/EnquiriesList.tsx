'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { titleCase } from '@/lib/text'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { useRowSelection } from '@/components/ui/useRowSelection'
import { ExportBar } from '@/components/ui/ExportBar'
import { PageContainer } from '@/components/PageContainer'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { Popover } from '@/components/ui/Popover'
import { StatusTag } from '@/components/ui/StatusTag'
import { ENQUIRY_STAGE_KIND, ENQUIRY_STAGE_LABEL, ENQUIRY_STAGE_TABS } from '@/features/enquiries/status'
import { AddEnquiryButton } from './AddEnquiryButton'
import type { EnquiryRowData } from './EnquiryRow'

// Visual filtering only: tabs / search / sort operate on the already-loaded page data. None of them
// change enquiry stage or any backend record - stage is backend truth, driven by real business events.

const DATE_FMT = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const createdLabel = (ms: number) => DATE_FMT.format(new Date(ms))

// Active = leads still being worked on; archived ones have their own tab (booked leads are not listed).
const inProgress = (r: { status: string }) => r.status !== 'DECLINED'

/**
 * Broad service category (Type column) derived from the enquiry's Event. The schema has one event field,
 * so Type is derived here rather than stored twice - the smallest correct solution for two columns.
 */
function broadType(event: string): string {
  const e = event.toLowerCase()
  if (/wedding|elopement/.test(e)) return 'Wedding'
  if (/engage/.test(e)) return 'Engagement'
  if (/portrait|graduation|family|headshot|maternity|newborn/.test(e)) return 'Portrait'
  if (/corporate|commercial|brand|product|event/.test(e)) return 'Corporate'
  return titleCase(event)
}

// Tabs: Active (the working pipeline, excludes Archived) + one per stage. Counts come from real data.
type TabKey = 'all' | string
type SortKey = 'newest' | 'oldest' | 'name'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Created date: newest' },
  { key: 'oldest', label: 'Created date: oldest' },
  { key: 'name', label: 'Lead name A-Z' },
]

export function EnquiriesList({ rows, csrf }: { rows: EnquiryRowData[]; csrf: string }) {
  const [tab, setTab] = useState<TabKey>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const { selectedIds, selection } = useRowSelection<EnquiryRowData>()

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: rows.filter(inProgress).length }
    for (const t of ENQUIRY_STAGE_TABS) map[t.key] = rows.filter((r) => r.status === t.key).length
    return map
  }, [rows])

  const visible = useMemo(() => {
    let out = tab === 'all' ? rows.filter(inProgress) : rows.filter((r) => r.status === tab)
    out = [...out]
    if (sort === 'newest') out.sort((a, b) => b.createdMs - a.createdMs)
    else if (sort === 'oldest') out.sort((a, b) => a.createdMs - b.createdMs)
    else out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [rows, tab, sort])

  const sortLabel = SORTS.find((s) => s.key === sort)!.label
  const TABS: { key: TabKey; label: string }[] = [{ key: 'all', label: 'Active' }, ...ENQUIRY_STAGE_TABS]

  // Exactly six information columns (spec §9): Lead ID | Created | Client | Event | Type | Stage.
  // Column sizing: an EVEN Carbon-style rhythm across the full width (no single column absorbing the
  // slack). Every column is a `fr` share (Client/Event 1.5, the rest 1-1.4) so the spacing reads
  // balanced; each carries a small `em` min via minmax so text/pills never clip - at narrow widths the
  // whole table scrolls (DataTable's min width) rather than squashing. Stage keeps the largest min for
  // its longest label ("Awaiting booking confirmation"), whose tag never wraps. Header + rows share this
  // one grid, so keylines always line up.
  const columns: DataColumn<EnquiryRowData>[] = [
    {
      key: 'number',
      // The value has a leading unread-dot (+gap); mirror that spacer here so the header label sits
      // exactly above the Lead ID text instead of shifting left of it.
      header: (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0" aria-hidden="true" />
          <span>Lead ID</span>
        </span>
      ),
      width: 'minmax(8em, 1fr)',
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.unread ? 'bg-warn' : 'bg-transparent'}`} />
          <Link href={`/leads/${r.id}`} className={`tabular block whitespace-nowrap text-ink transition-colors group-hover:text-accent-ink ${r.unread ? 'font-semibold' : 'font-medium'}`}>
            {r.number ?? '-'}
          </Link>
        </span>
      ),
    },
    { key: 'created', header: 'Created', width: 'minmax(8.5em, 1fr)', cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{createdLabel(r.createdMs)}</span> },
    {
      key: 'client',
      // The lead's name ("Jenny & Matt"); a website lead is named after the person who enquired.
      header: 'Lead',
      width: 'minmax(11em, 1.5fr)',
      cell: (r) => (
        <Link href={`/leads/${r.id}`} className={`block truncate text-ink transition-colors hover:text-accent-ink ${r.unread ? 'font-semibold' : ''}`}>
          {r.name}
        </Link>
      ),
    },
    { key: 'event', header: 'Event', width: 'minmax(9em, 1.5fr)', cell: (r) => <span className="block truncate text-ink-muted">{r.event}</span> },
    {
      key: 'type',
      header: 'Type',
      width: 'minmax(8em, 1fr)',
      cell: (r) => <span className="inline-flex items-center whitespace-nowrap rounded-full bg-sunk px-2 py-0.5 text-xs text-ink-muted">{broadType(r.event)}</span>,
    },
    {
      key: 'stage',
      header: 'Stage',
      width: 'minmax(16em, 1.4fr)',
      cell: (r) => (
        <StatusTag kind={ENQUIRY_STAGE_KIND[r.status] ?? 'enquiry'}>
          <span className="whitespace-nowrap">{ENQUIRY_STAGE_LABEL[r.status] ?? titleCase(r.status)}</span>
        </StatusTag>
      ),
    },
  ]

  // Stage filter as a compact structured-list dropdown (not a wide tab strip); rendered as the toolbar's
  // leading control so filter + search sit together on one row.
  const filterControl = (
    <Popover
      width={280}
      align="left"
      renderTrigger={({ ref, onClick }) => (
        <button ref={ref} type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:bg-sunk">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
          <span className="font-medium">{TABS.find((t) => t.key === tab)?.label ?? 'All'}</span>
          <span className="tabular rounded-full bg-sunk px-1.5 py-0.5 text-xs leading-none text-ink-muted">{counts[tab] ?? 0}</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col">
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); close() }}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-paper ${active ? 'font-medium text-ink' : 'text-ink-muted'}`}
              >
                <span>{t.label}</span>
                <span className={`tabular rounded-full px-1.5 py-0.5 text-xs leading-none ${active ? 'bg-line text-ink-muted' : 'bg-sunk text-ink-muted'}`}>{counts[t.key] ?? 0}</span>
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )

  const sortControl = (
    <Popover
      width={200}
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
              {sort === s.key ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )

  return (
    <PageContainer variant="full">
      <PageHeader
        breadcrumb={[DASHBOARD_CRUMB, { label: 'Leads' }]}
        title="Leads"
        actions={<AddEnquiryButton csrf={csrf} />}
      />

      <div>
        {/* Batch bar appears above the toolbar only when rows are selected (otherwise renders nothing). */}
        <ExportBar count={selectedIds.length} reportHref={`/leads/report?ids=${selectedIds.join(',')}`} className="mb-3" />
        <DataTable
          ariaLabel="Leads"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.unread ? 'font-semibold' : undefined)}
          pageSize={30}
          selection={selection}
          search={(r) => `${r.number ?? ''} ${r.name} ${r.event}`}
          searchPlaceholder="Search leads"
          toolbarStart={filterControl}
          toolbarEnd={sortControl}
          emptyMessage="No leads in this view yet."
        />
      </div>
    </PageContainer>
  )
}
