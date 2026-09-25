import type { Tone } from '@/components/ui/StatusPill'

/**
 * The simplified quote status the whole UI shows: Pending -> Sent -> Accepted, plus Declined. The database
 * keeps a finer enum (DRAFT/SENT/VIEWED/ACCEPTED/DECLINED/SUPERSEDED) for correctness, but the app folds it
 * down so staff see one clean pipeline: "Draft" reads as Pending, Viewed reads as Sent, and quotes never
 * auto-"expire" here.
 *
 * `group` drives the Quotes list tabs AND keeps the counts clean: Active / Accepted / Declined are three
 * separate buckets (a won quote is never counted with a lost one). SUPERSEDED (a duplicate quote that lost
 * when another was accepted for the same client) maps to `hidden` - it's rare noise, so it's dropped from
 * the list entirely rather than shown as a confusing extra state.
 */
export type QuoteGroup = 'active' | 'accepted' | 'declined' | 'hidden'
export type QuoteView = { label: string; group: QuoteGroup; tone: Tone }

export function quoteView(dbStatus: string): QuoteView {
  switch (dbStatus) {
    case 'DRAFT':
      return { label: 'Pending', group: 'active', tone: 'neutral' }
    case 'SENT':
    case 'VIEWED':
      return { label: 'Sent', group: 'active', tone: 'info' }
    case 'ACCEPTED':
      return { label: 'Accepted', group: 'accepted', tone: 'good' }
    case 'DECLINED':
      return { label: 'Declined', group: 'declined', tone: 'bad' }
    default:
      // SUPERSEDED and anything unexpected: hide it from the list (kept in the DB, just not surfaced).
      return { label: 'Closed', group: 'hidden', tone: 'neutral' }
  }
}
