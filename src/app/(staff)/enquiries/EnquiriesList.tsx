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
import { COL } from '@/components/ui/tableColumns'
import { Popover } from '@/components/ui/Popover'
import { StatusTag } from '@/components/ui/StatusTag'
import { ENQUIRY_STAGE_KIND, ENQUIRY_STAGE_LABEL, ENQUIRY_STAGE_TABS } from '@/features/enquiries/status'
import { AddEnquiryButton } from './AddEnquiryButton'
import type { EnquiryRowData } from './EnquiryRow'

// Visual filtering only: tabs / search / sort operate on the already-loaded page data. None of them
// change enquiry stage or any backend record - stage is backend truth, driven by real business events.

const DATE_FMT = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const createdLabel = (ms: number) => DATE_FMT.format(new Date(ms))

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

// Tabs: All (the working pipeline, excludes Declined) + one per stage. Counts come from real data.
type TabKey = 'all' | string
type SortKey = 'newest' | 'oldest' | 'name'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Created date: newest' },
  { key: 'oldest', label: 'Created date: oldest' },
  { key: 'name', label: 'Client A-Z' },
]

export function EnquiriesList({ rows, csrf }: { rows: EnquiryRowData[]; csrf: string }) {
  const [tab, setTab] = useState<TabKey>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const { selectedIds, selection } = useRowSelection<EnquiryRowData>()

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: rows.filter((r) => r.status !== 'DECLINED').length }
    for (const t of ENQUIRY_STAGE_TABS) map[t.key] = rows.filter((r) => r.status === t.key).length
    return map
  }, [rows])

  const visible = useMemo(() => {
    let out = tab === 'all' ? rows.filter((r) => r.status !== 'DECLINED') : rows.filter((r) => r.status === tab)
    out = [...out]
    if (sort === 'newest') out.sort((a, b) => b.createdMs - a.createdMs)
    else if (sort === 'oldest') out.sort((a, b) => a.createdMs - b.createdMs)
    else out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [rows, tab, sort])

  const sortLabel = SORTS.find((s) => s.key === sort)!.label
  const TABS: { key: TabKey; label: string }[] = [{ key: 'all', label: 'All' }, ...ENQUIRY_STAGE_TABS]

  // Exactly six information columns (spec §9): Enquiry ID | Created Date | Client | Event | Type | Stage.
  const columns: DataColumn<EnquiryRowData>[] = [
    {
      key: 'number',
      header: 'Enquiry ID',
      width: COL.constrained,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.unread ? 'bg-warn' : 'bg-transparent'}`} />
          <Link href={`/enquiries/${r.id}`} className={`tabular block whitespace-nowrap text-ink transition-colors group-hover:text-accent-ink ${r.unread ? 'font-semibold' : 'font-medium'}`}>
            {r.number ?? '-'}
          </Link>
        </span>
      ),
    },
    { key: 'created', header: 'Created', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{createdLabel(r.createdMs)}</span> },
    {
      key: 'client',
      header: 'Client',
      width: COL.flexHigh,
      cell: (r) => (
        <Link href={`/enquiries/${r.id}`} className={`block truncate text-ink transition-colors hover:text-accent-ink ${r.unread ? 'font-semibold' : ''}`}>
          {r.name}
        </Link>
      ),
    },
    { key: 'event', header: 'Event', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink-muted">{r.event}</span> },
    {
      key: 'type',
      header: 'Type',
      width: COL.content,
      cell: (r) => <span className="inline-flex items-center rounded-full bg-sunk px-2 py-0.5 text-xs text-ink-muted">{broadType(r.event)}</span>,
    },
    {
      key: 'stage',
      header: 'Stage',
      width: COL.content,
      cell: (r) => <StatusTag kind={ENQUIRY_STAGE_KIND[r.status] ?? 'enquiry'}>{ENQUIRY_STAGE_LABEL[r.status] ?? titleCase(r.status)}</StatusTag>,
    },
  ]

  return (
    <PageContainer variant="full">
      <PageHeader
        breadcrumb={[DASHBOARD_CRUMB, { label: 'Enquiries' }]}
        title="Enquiries"
        description="Your sales pipeline - from first enquiry to a confirmed booking. Confirmed leads stay here as a record and open as a Job."
        actions={<AddEnquiryButton csrf={csrf} />}
      />

      {/* Stage tabs + sort */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Enquiry stage">
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
              >
                {t.label}
                <span className={`tabular rounded-full px-1.5 py-0.5 text-xs leading-none ${active ? 'bg-line text-ink-muted' : 'bg-sunk text-ink-muted'}`}>{counts[t.key] ?? 0}</span>
              </button>
            )
          })}
        </div>
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
      </div>

      {/* Table */}
      <ExportBar count={selectedIds.length} reportHref={`/enquiries/report?ids=${selectedIds.join(',')}`} className="mt-4" />
      <div className="mt-4">
        <DataTable
          ariaLabel="Enquiries"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.unread ? 'font-semibold' : undefined)}
          pageSize={30}
          selection={selection}
          search={(r) => `${r.number ?? ''} ${r.name} ${r.event}`}
          searchPlaceholder="Search enquiries"
          emptyMessage="No enquiries in this view yet."
        />
      </div>
    </PageContainer>
  )
}
