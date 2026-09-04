'use client'

import Link from 'next/link'
import { useActionState, useRef, type ChangeEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { importClientsAction, type ImportState } from './actions'

const INITIAL: ImportState = { status: 'idle' }

export function ImportForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(importClientsAction, INITIAL)
  const taRef = useRef<HTMLTextAreaElement>(null)

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      if (taRef.current) taRef.current.value = text
    })
  }

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="csrf" value={csrf} />

      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      {state.status === 'done' ? (
        <Alert tone="info" title="Import finished">
          Created {state.created} · skipped {state.skipped} (already existed) · failed {state.failed}.{' '}
          <Link href="/clients" className="font-medium text-accent-ink hover:underline">View clients</Link>
        </Alert>
      ) : null}

      <div>
        <label htmlFor="csv-file" className="mb-1 block text-sm font-medium text-ink">Upload a CSV file (optional)</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-sunk" />
      </div>

      <div>
        <label htmlFor="csv" className="mb-1 block text-sm font-medium text-ink">Or paste rows</label>
        <p className="mb-1.5 text-xs text-ink-muted">One client per line: <span className="tabular">name, email, phone</span>. A header row is optional. Rows whose email already exists are skipped.</p>
        <textarea
          id="csv"
          name="csv"
          ref={taRef}
          rows={10}
          placeholder={'name, email, phone\nHa Vy Tran, ha@example.com, +61 410 208 428'}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <Button type="submit" loading={pending}>Import clients</Button>
      </div>
    </form>
  )
}
