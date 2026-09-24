'use client'

import Link from 'next/link'
import { useActionState, useState, type ChangeEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { importClientsAction, type ImportState } from './actions'

const INITIAL: ImportState = { status: 'idle' }

export function ImportForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(importClientsAction, INITIAL)
  // Controlled so an uploaded file's contents are definitely part of the submitted form.
  const [csv, setCsv] = useState('')

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => setCsv(text))
  }

  const done = state.status === 'done' ? state : null
  const tone = !done ? 'info' : done.created > 0 ? 'info' : done.failed > 0 ? 'danger' : 'info'

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="csrf" value={csrf} />

      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      {done ? (
        <Alert tone={tone} title="Import finished">
          Created {done.created} · skipped {done.skipped} (already existed) · failed {done.failed}.{' '}
          <Link href="/clients" className="font-medium text-accent-ink hover:underline">View clients</Link>
          {done.created === 0 && done.failed > 0 ? (
            <span className="mt-1 block text-ink-muted">Nothing was created. Check each line reads <span className="tabular">name, email, phone</span> with a valid email - a row without a valid email is skipped.</span>
          ) : null}
          {done.created === 0 && done.failed === 0 && done.skipped > 0 ? (
            <span className="mt-1 block text-ink-muted">Every row was already a client (matched by email), so nothing new was added - they are already in your list. To add someone, use a row with an email that is not in the system yet.</span>
          ) : null}
        </Alert>
      ) : null}

      <div>
        <label htmlFor="csv-file" className="mb-1 block text-sm font-medium text-ink">Upload a CSV file (optional)</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-sunk" />
      </div>

      <div>
        <label htmlFor="csv" className="mb-1 block text-sm font-medium text-ink">Or paste rows</label>
        <p className="mb-1.5 text-xs text-ink-muted">One client per line: <span className="tabular">name, email, phone</span>. Separated by commas or tabs, so you can paste straight from a spreadsheet. A header row is optional. Rows whose email already exists are skipped.</p>
        <textarea
          id="csv"
          name="csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          placeholder="name, email, phone"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <Button type="submit" loading={pending}>Import clients</Button>
      </div>
    </form>
  )
}
