import type { Tone } from '@/components/ui/StatusPill'

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

      return { label: 'Closed', group: 'hidden', tone: 'neutral' }
  }
}
