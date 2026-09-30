'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { StatusPill } from '@/components/ui/StatusPill'
import { quoteView } from '@/features/quotes/status'
import { deleteQuotesAction } from './actions'

export type QuoteRow = {
  id: string
  number: string
  client: string
  amount: string
  status: string
  updated: string
}

type TabKey = 'active' | 'accepted' | 'declined'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
]

export function QuotesTable({ rows, csrf }: { rows: QuoteRow[]; csrf: string }) {
  const [tab, setTab] = useState<TabKey>('active')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const counts = {
    active: rows.filter((r) => quoteView(r.status).group === 'active').length,
    accepted: rows.filter((r) => quoteView(r.status).group === 'accepted').length,
    declined: rows.filter((r) => quoteView(r.status).group === 'declined').length,
  }
  const visible = rows.filter((r) => quoteView(r.status).group === tab)

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const present = new Set(rows.map((r) => r.id))
      const next = new Set([...prev].filter((id) => present.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  const switchTab = (key: TabKey) => {
    setTab(key)
    setSelectedIds(new Set())
  }

  const canDelete = (r: QuoteRow) => r.status !== 'ACCEPTED'
  const selection = {
    isSelected: (id: string) => selectedIds.has(id),
    isSelectable: canDelete,
    onToggle: (id: string) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    onToggleMany: (ids: string[], selected: boolean) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (selected) next.add(id)
          else next.delete(id)
        }
        return next
      }),
  }
  const selectedCount = selectedIds.size

  const columns: DataColumn<QuoteRow>[] = [
    { key: 'quote', header: 'Quote', width: COL.constrained, cell: (r) => <Link href={`/quotes/${r.id}`} className="tabular block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.number}</Link> },
    { key: 'client', header: 'Client', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink">{r.client}</span> },
    { key: 'amount', header: 'Amount', width: COL.constrained, cell: (r) => <span className="tabular text-ink">{r.amount}</span> },
    { key: 'status', header: 'Status', width: COL.content, cell: (r) => { const v = quoteView(r.status); return <StatusPill tone={v.tone}>{v.label}</StatusPill> } },
    { key: 'updated', header: 'Updated', width: COL.constrained, cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{r.updated}</span> },
  ]

  return (
    <>
      {/* Toolbar. Ticking rows swaps it for a Carbon batch-action bar; otherwise the Active/Closed tabs. */}
      {selectedCount > 0 ? (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-strong bg-sunk px-3 py-2">
          <span className="text-sm font-medium text-ink">{selectedCount} selected</span>
          <div className="flex items-center gap-1">
            <form
              action={deleteQuotesAction}
              onSubmit={(e) => {
                if (!window.confirm(`Delete ${selectedCount} quote${selectedCount > 1 ? 's' : ''}? This can't be undone.`)) e.preventDefault()
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="ids" value={Array.from(selectedIds).join(',')} />
              <button type="submit" className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-lost-ink transition-colors hover:bg-lost/50">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                Delete
              </button>
            </form>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-md px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-7 flex flex-wrap items-center gap-1 border-b border-line pb-2" role="tablist" aria-label="Quote status">
          {TABS.map((t) => {
            const on = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => switchTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${on ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
              >
                {t.label}
                <span className={`tabular rounded-full px-1.5 py-0.5 text-xs leading-none ${on ? 'bg-line text-ink-muted' : 'bg-sunk text-ink-muted'}`}>{counts[t.key]}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Table (mt-4 so the active search sits below the toolbar with the same gap as the other lists). */}
      <div className="mt-4">
        <DataTable
          ariaLabel="Quotes"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          pageSize={30}
          selection={selection}
          search={(r) => `${r.number} ${r.client}`}
          searchPlaceholder="Search quotes"
          emptyMessage={tab === 'active' ? 'No active quotes. Create one from a lead to get started.' : tab === 'accepted' ? 'No accepted quotes yet.' : 'No declined quotes.'}
        />
      </div>
    </>
  )
}
