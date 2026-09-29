'use client'

import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { Button } from '@/components/ui/Button'
import { createQuoteForEnquiryAction } from '../actions'

export type QuotePickerRow = { id: string; number: string | null; client: string; event: string; received: string }

/**
 * Choose the enquiry a new quote is for. The shared DataTable (search + pagination) so the picker fills the
 * page like every other list instead of a column of cards with a long gap before each button.
 */
export function NewQuotePicker({ rows, csrf }: { rows: QuotePickerRow[]; csrf: string }) {
  const columns: DataColumn<QuotePickerRow>[] = [
    { key: 'number', header: 'Enquiry ID', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink">{r.number ?? '-'}</span> },
    { key: 'client', header: 'Client', width: COL.flexHigh, cell: (r) => <span className="block truncate font-medium text-ink">{r.client}</span> },
    { key: 'event', header: 'Event', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink-muted">{r.event}</span> },
    { key: 'received', header: 'Received', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.received}</span> },
    {
      key: 'action',
      header: '',
      width: COL.content,
      align: 'right',
      cell: (r) => (
        <form action={createQuoteForEnquiryAction}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="enquiryId" value={r.id} />
          <Button type="submit" size="sm">Create quote</Button>
        </form>
      ),
    },
  ]

  return (
    <DataTable
      ariaLabel="Open enquiries"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={30}
      search={(r) => `${r.number ?? ''} ${r.client} ${r.event}`}
      searchPlaceholder="Search enquiries"
      emptyMessage="No open enquiries to quote. Quotes are created from an enquiry."
    />
  )
}
