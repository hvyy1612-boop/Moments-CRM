'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Field, TextInput } from '@/components/ui/form'
import { searchClientsAction, type ClientMatch } from './actions'

/**
 * The client a new lead belongs to, for "Add lead" on the Leads page: search for and pick an EXISTING
 * client. New clients are added in Clients first (Studio-Ninja order: record the client, then add the
 * lead), so this never creates one. Emits a hidden `clientId`.
 */
export function ClientContactPicker({ error, onPick }: { error?: string; onPick?: () => void }) {
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
    <Field label="Client" htmlFor="clientSearch" error={error} required>
      <input type="hidden" name="clientId" value={selected?.id ?? ''} />
      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded border border-ink bg-surface px-3 py-2">
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
            hasError={Boolean(error)}
          />
          {query.trim().length >= 2 ? (
            <div className="mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-sm">
              {loading ? (
                <div className="px-3 py-2 text-sm text-ink-muted">Searching...</div>
              ) : results.length ? (
                <ul>
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(c)
                          setResults([])
                          onPick?.()
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
                <div className="px-3 py-2 text-sm text-ink-muted">
                  No matching clients.{' '}
                  <Link href="/clients" className="font-medium text-accent-ink hover:underline">
                    Add them in Clients first
                  </Link>
                  .
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Field>
  )
}
