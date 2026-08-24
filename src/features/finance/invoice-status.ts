import type { StatusKind } from '@/components/ui/StatusTag'

/** Map an InvoiceStatus to its display colour + label, and to a board group. */
export const INVOICE_KIND: Record<string, StatusKind> = {
  DRAFT: 'hold',
  ISSUED: 'booked',
  SENT: 'quote',
  PARTIALLY_PAID: 'editing',
  PAID: 'delivered',
  OVERDUE: 'lost',
  VOID: 'hold',
}

export const OUTSTANDING = new Set(['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'])

export function invoiceGroup(status: string): 'outstanding' | 'paid' | 'other' {
  if (OUTSTANDING.has(status)) return 'outstanding'
  if (status === 'PAID') return 'paid'
  return 'other'
}
