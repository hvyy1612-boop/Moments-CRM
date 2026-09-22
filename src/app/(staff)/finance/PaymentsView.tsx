'use client'

import { useMemo, useState } from 'react'
import { ActiveSearchField, NoSearchResults } from '@/components/ui/ActiveSearch'
import { invoiceGroup } from '@/features/finance/invoice-status'
import { InvoiceTable, type Row } from './InvoiceTable'

/** A grouped section: a Clients-style "Title · N" toolbar over its own clean table. */
function Group({ title, rows, first }: { title: string; rows: Row[]; first: boolean }) {
  if (rows.length === 0) return null
  return (
    <section className={first ? 'mt-6' : 'mt-10'}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <div className="text-sm text-ink">
          {title} <span className="text-ink-muted">· {rows.length}</span>
        </div>
      </div>
      <InvoiceTable rows={rows} />
    </section>
  )
}

/**
 * Payments is grouped (Outstanding / Paid / Draft), so it keeps ONE page-level active search (the shared
 * ActiveSearchField, same as every other list) that filters invoice number + client across all groups.
 * The old server `?q=` header box is gone; the groups re-derive from the filtered set.
 */
export function PaymentsView({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(
    () => (q ? rows.filter((r) => `${r.number} ${r.client}`.toLowerCase().includes(q)) : rows),
    [rows, q],
  )
  const outstanding = filtered.filter((r) => invoiceGroup(r.status) === 'outstanding')
  const paid = filtered.filter((r) => invoiceGroup(r.status) === 'paid')
  const other = filtered.filter((r) => invoiceGroup(r.status) === 'other')

  return (
    <div>
      <div className="mb-1">
        <ActiveSearchField value={query} onChange={setQuery} placeholder="Search invoices" resultCount={filtered.length} />
      </div>

      {filtered.length === 0 ? (
        q ? (
          <NoSearchResults query={query} onClear={() => setQuery('')} />
        ) : (
          <p className="py-16 text-center text-sm text-ink-muted">No invoices yet. Create one with New invoice, or raise it from a job.</p>
        )
      ) : (
        <>
          <Group title="Outstanding" rows={outstanding} first />
          <Group title="Paid" rows={paid} first={outstanding.length === 0} />
          <Group title="Draft & void" rows={other} first={outstanding.length === 0 && paid.length === 0} />
        </>
      )}
    </div>
  )
}
