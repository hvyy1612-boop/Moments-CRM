'use client'

import { useRef, useState } from 'react'
import { Field, TextInput } from '@/components/ui/form'
import { searchClientsAction, type ClientMatch } from './actions'

/**
 * Studio-Ninja style "Primary Client Contact": search for and pick an existing client, OR add a new
 * one inline. Emits a hidden `clientId` (when an existing client is chosen); otherwise the new-client
 * fields (name / email / phone) are submitted and the server creates/links the client.
 */
export function ClientContactPicker({ errors }: { errors?: { name?: string; email?: string } }) {
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientMatch[]>([])
  const [selected, setSelected] = useState<ClientMatch | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQuery(v: string) {
    setQuery(v)
    setSelected(null)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const r = await searchClientsAction(v)
      setResults(r)
      setLoading(false)
    }, 220)
  }

  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Primary client contact</div>
      {/* Existing-client id (empty when creating a new client below). */}
      <input type="hidden" name="clientId" value={selected?.id ?? ''} />

      {mode === 'search' ? (
        selected ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-surface px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{selected.displayName}</span>
              <span className="block truncate text-xs text-ink-muted">{selected.email}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setQuery('')
              }}
              className="shrink-0 text-sm font-medium text-accent-ink hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div>
            <TextInput
              id="clientSearch"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search a client by name or email"
              autoComplete="off"
            />
            {query.trim().length >= 2 ? (
              <div className="mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-sm">
                {loading ? (
                  <div className="px-3 py-2 text-sm text-ink-muted">Searching…</div>
                ) : results.length ? (
                  <ul>
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(c)
                            setResults([])
                          }}
                          className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-sunk"
                        >
                          <span className="text-sm text-ink">{c.displayName}</span>
                          <span className="text-xs text-ink-muted">{c.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-2 text-sm text-ink-muted">No matching clients.</div>
                )}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setMode('new')}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline"
            >
              + Add a new client
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Client name" htmlFor="enq-name" error={errors?.name} required>
            <TextInput id="enq-name" name="name" required autoFocus autoComplete="off" hasError={Boolean(errors?.name)} />
          </Field>
          <Field label="Client email" htmlFor="enq-email" error={errors?.email} required>
            <TextInput id="enq-email" name="email" type="email" required autoComplete="off" hasError={Boolean(errors?.email)} />
          </Field>
          <Field label="Phone" htmlFor="enq-phone">
            <TextInput id="enq-phone" name="phone" autoComplete="off" />
          </Field>
          <button type="button" onClick={() => setMode('search')} className="self-start text-sm font-medium text-accent-ink hover:underline">
            Use an existing client instead
          </button>
        </div>
      )}
    </div>
  )
}
