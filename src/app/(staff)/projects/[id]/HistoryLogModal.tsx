'use client'

import { useState } from 'react'

export type HistoryEntry = {
  id: string
  actionType: string
  dateLabel: string
  user: string
  details: string
}

export function HistoryLogModal({ entries }: { entries: HistoryEntry[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink"
      >
        History Log
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-md border border-line bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-ink">Workflow History Log</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink"
              >
                ×
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="text-base text-ink-muted">No history yet.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Action Type</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-line align-top last:border-b-0">
                      <td className="py-2 pr-3">
                        <span className="inline-block rounded bg-paper px-2 py-0.5 text-sm font-bold text-ink">
                          {e.actionType}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-sm text-ink-muted">{e.dateLabel}</td>
                      <td className="py-2 pr-3 text-sm text-ink-muted">{e.user}</td>
                      <td className="py-2 text-sm text-ink">{e.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
