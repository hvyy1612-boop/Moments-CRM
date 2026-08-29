'use client'

import { useRouter } from 'next/navigation'

/**
 * The Enquiries filter, as a single dropdown (Studio-Ninja style) rather than a row of chips. Each
 * option carries its live count. Selecting one navigates the server-rendered list to that view.
 */
export function ViewSelect({
  value,
  options,
}: {
  value: string
  options: { key: string; label: string; count: number }[]
}) {
  const router = useRouter()
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        router.push(v === 'all' ? '/enquiries' : `/enquiries?view=${v}`)
      }}
      aria-label="Filter enquiries"
      className="h-9 rounded border border-line-strong bg-surface px-3 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label} · {o.count}
        </option>
      ))}
    </select>
  )
}
