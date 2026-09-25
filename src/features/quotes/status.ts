import type { Tone } from '@/components/ui/StatusPill'

/**
 * The simplified quote status the whole UI shows: Pending -> Sent -> Accepted, plus Declined. The database
 * keeps a finer enum (DRAFT/SENT/VIEWED/ACCEPTED/DECLINED/SUPERSEDED) for correctness, but the app folds it
 * down so staff see one clean pipeline: "Draft" reads as Pending, Viewed reads as Sent, quotes never
 * auto-"expire" here, and Superseded (a sibling quote that lost when another was accepted) sits quietly in
 * Closed. `group` drives the Active/Closed tab split; `tone` drives the status tag colour.
 */
export type QuoteGroup = 'active' | 'closed'
export type QuoteView = { label: string; group: QuoteGroup; tone: Tone }

export function quoteView(dbStatus: string): QuoteView {
  switch (dbStatus) {
    case 'DRAFT':
      return { label: 'Pending', group: 'active', tone: 'neutral' }
    case 'SENT':
    case 'VIEWED':
      return { label: 'Sent', group: 'active', tone: 'info' }
    case 'ACCEPTED':
      return { label: 'Accepted', group: 'closed', tone: 'good' }
    case 'DECLINED':
      return { label: 'Declined', group: 'closed', tone: 'bad' }
    case 'SUPERSEDED':
      // Staff-friendly: this quote lost to another accepted quote for the same client (or was replaced by
      // a newer version). "Replaced" reads plainer than the "Superseded" jargon.
      return { label: 'Replaced', group: 'closed', tone: 'neutral' }
    default:
      return { label: 'Closed', group: 'closed', tone: 'neutral' }
  }
}
