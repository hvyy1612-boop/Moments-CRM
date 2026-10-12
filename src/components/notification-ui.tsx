import type { AlertKind } from '@/lib/domain/alerts'

/** Relative label in BOTH directions: a past event reads "2h ago", a future one "in 3d". */
export function when(at: Date): string {
  const diffMs = new Date(at).getTime() - Date.now()
  const future = diffMs > 0
  const s = Math.round(Math.abs(diffMs) / 1000)
  const unit = s < 60 ? 'now' : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`
  if (unit === 'now') return future ? 'soon' : 'just now'
  return future ? `in ${unit}` : `${unit} ago`
}

/** Circle colour by kind: maroon for enquiries, green for payments, red for overdue, amber for shoots. */
export function alertTint(kind: AlertKind): string {
  if (kind === 'payment') return 'bg-delivered text-delivered-ink'
  if (kind === 'overdue') return 'bg-lost text-lost-ink'
  if (kind === 'shoot') return 'bg-sunk text-warn'
  return 'bg-accent-tint text-accent-ink'
}

/** Icon per notification kind. `size` is a Tailwind h-/w- class pair. */
export function KindIcon({ kind, size = 'h-3.5 w-3.5' }: { kind: AlertKind; size?: string }) {
  const common = { viewBox: '0 0 24 24', className: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'payment') return <svg {...common}><path d="M12 2v20M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.7 7 6.8s2 2.7 5 3.4 5 1.4 5 3.5-2.2 3.3-5 3.3-5-1.1-5-3" /></svg>
  if (kind === 'overdue') return <svg {...common}><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
  if (kind === 'shoot') return <svg {...common}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
  return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
}
