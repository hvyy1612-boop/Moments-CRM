'use client'

import { useState } from 'react'

export type HistoryRow = { id: string; date: string; time: string; user: string; action: string; details: string }

const icon = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

/**
 * The invoice's audit trail: real recorded events only (created, saved, issued, sent, payments, refunds,
 * voids), oldest first. Light on purpose - hairline rows, no zebra, no boxed cells. On a phone the time
 * folds under the date and the user under the action.
 */
export function HistoryLog({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-base font-semibold text-ink">
          <svg {...icon} className="h-5 w-5 text-ink-muted"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          History log
        </span>
        <svg {...icon} className={`h-4 w-4 text-ink-muted transition-transform ${open ? '' : 'rotate-180'}`}><path d="m6 15 6-6 6 6" /></svg>
      </button>
      {open ? (
        rows.length === 0 ? (
          <p className="border-t border-line px-5 py-6 text-sm text-ink-muted">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-sunk text-left text-ink">
                  <th scope="col" className="border-r border-line px-5 py-3 font-semibold">Date</th>
                  <th scope="col" className="hidden border-r border-line px-5 py-3 font-semibold sm:table-cell">Time</th>
                  <th scope="col" className="hidden border-r border-line px-5 py-3 font-semibold md:table-cell">User</th>
                  <th scope="col" className="border-r border-line px-5 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="tabular whitespace-nowrap border-r border-line px-5 py-4 text-ink">
                      {r.date}
                      <span className="block text-xs text-ink-muted sm:hidden">{r.time}</span>
                    </td>
                    <td className="tabular hidden whitespace-nowrap border-r border-line px-5 py-4 text-ink-muted sm:table-cell">{r.time}</td>
                    <td className="hidden whitespace-nowrap border-r border-line px-5 py-4 text-ink md:table-cell">{r.user}</td>
                    <td className="whitespace-nowrap border-r border-line px-5 py-4 text-ink">
                      {r.action}
                      <span className="block text-xs text-ink-muted md:hidden">{r.user}</span>
                    </td>
                    <td className="px-5 py-4 text-ink-muted">{r.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  )
}
