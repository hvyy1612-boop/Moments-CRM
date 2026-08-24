'use client'

import { useState } from 'react'
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag'
import { LABEL_COLORS, type StatusLabel } from '../labels'
import { saveStatusLabelsAction } from '../status-actions'

const SWATCH: Record<StatusKind, string> = {
  enquiry: 'bg-enquiry-ink',
  quote: 'bg-quote-ink',
  booked: 'bg-booked-ink',
  editing: 'bg-editing-ink',
  delivered: 'bg-delivered-ink',
  lost: 'bg-lost-ink',
  hold: 'bg-hold-ink',
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `c-${String(performance.now()).replace('.', '')}`
}

export function LabelEditor({
  labels: initial,
  csrf,
  onClose,
}: {
  labels: StatusLabel[]
  csrf: string
  onClose: () => void
}) {
  const [labels, setLabels] = useState<StatusLabel[]>(() => initial.map((l) => ({ ...l })))

  const update = (id: string, patch: Partial<StatusLabel>) =>
    setLabels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const remove = (id: string) => setLabels((ls) => ls.filter((l) => l.id !== id))
  const add = () =>
    setLabels((ls) => [...ls, { id: newId(), name: 'New label', color: 'hold', stage: null, order: ls.length }])

  const payload = JSON.stringify(labels.map((l, i) => ({ ...l, order: i })))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink">Edit statuses</h2>
          <button type="button" onClick={onClose} className="text-sm text-ink-muted hover:text-ink">
            Close
          </button>
        </div>
        <p className="mb-4 text-sm text-ink-muted">
          Rename, recolour, add, or remove statuses. Built-in stages keep driving the workflow; a
          status you add is a label only.
        </p>

        <div className="flex flex-col gap-3">
          {labels.map((label) => (
            <div key={label.id} className="rounded-md border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <StatusTag kind={label.color} solid>
                  {label.name.trim() || 'Untitled'}
                </StatusTag>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{label.stage ? 'built-in' : 'custom'}</span>
                  <button
                    type="button"
                    onClick={() => remove(label.id)}
                    className="text-sm text-lost-ink hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <input
                value={label.name}
                onChange={(e) => update(label.id, { name: e.target.value })}
                maxLength={40}
                aria-label="Status name"
                className="mb-2 w-full rounded border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink"
              />
              <div className="flex flex-wrap gap-1.5">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update(label.id, { color: c })}
                    aria-label={`Colour ${c}`}
                    className={`h-6 w-6 rounded ${SWATCH[c]} ${
                      label.color === c ? 'ring-2 ring-ink ring-offset-1' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="mt-3 w-full rounded-md border border-dashed border-line-strong py-2 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          + Add status
        </button>

        <form action={saveStatusLabelsAction} onSubmit={onClose} className="mt-4 flex justify-end gap-2">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="labels" value={payload} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
            Save
          </button>
        </form>
      </div>
    </div>
  )
}
