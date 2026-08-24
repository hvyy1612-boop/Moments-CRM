import type { ReactNode } from 'react'

type Area = { title: string; desc: string; icon: ReactNode }

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function icon(children: ReactNode): ReactNode {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...S}>
      {children}
    </svg>
  )
}

const AREAS: Area[] = [
  {
    title: 'Enquiries',
    desc: 'Capture and qualify new leads.',
    icon: icon(
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>,
    ),
  },
  {
    title: 'Projects',
    desc: 'Every shoot from quote to delivery.',
    icon: icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  },
  {
    title: 'Calendar',
    desc: 'Bookings and crew at a glance.',
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </>,
    ),
  },
  {
    title: 'Finance',
    desc: 'Invoices, payments, and balances.',
    icon: icon(
      <path d="M12 2v20M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.7 7 6.8s2 2.7 5 3.4 5 1.4 5 3.5-2.2 3.3-5 3.3-5-1.1-5-3" />,
    ),
  },
]

export function WorkspaceHighlights() {
  return (
    <ul className="mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
      {AREAS.map((area) => (
        <li
          key={area.title}
          className="rounded-lg border border-line bg-surface p-4 text-left"
        >
          <span className="text-accent">{area.icon}</span>
          <div className="mt-3 font-medium text-ink">{area.title}</div>
          <div className="mt-1 text-sm text-ink-muted">{area.desc}</div>
        </li>
      ))}
    </ul>
  )
}
