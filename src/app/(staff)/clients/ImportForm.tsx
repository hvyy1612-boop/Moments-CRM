'use client'

import Link from 'next/link'
import { useActionState, useState, type ChangeEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button, buttonClass } from '@/components/ui/Button'
import { FormActions, FormBlock, FormCell, PageForm, Textarea } from '@/components/ui/form'
import { importClientsAction, type ImportState } from './actions'

const INITIAL: ImportState = { status: 'idle' }

export function ImportForm({ csrf }: { csrf: string }) {
  const [sessionKey, setSessionKey] = useState(0)
  return <ImportSession key={sessionKey} csrf={csrf} onReset={() => setSessionKey((k) => k + 1)} />
}

function ImportSession({ csrf, onReset }: { csrf: string; onReset: () => void }) {
  const [state, action, pending] = useActionState(importClientsAction, INITIAL)

  const [csv, setCsv] = useState('')

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => setCsv(text))
  }

  if (state.status === 'done') return <ImportResult result={state} onReset={onReset} />

  return (
    <form action={action}>
      <input type="hidden" name="csrf" value={csrf} />

      {state.status === 'error' ? <div className="mb-6"><Alert tone="danger" title={state.message} /></div> : null}

      <PageForm>
        <FormBlock title="Upload a file" description="A .csv exported from a spreadsheet. Optional - you can paste the rows below instead.">
          <FormCell>
            <label htmlFor="csv-file" className="mb-1 block text-sm font-medium text-ink">CSV file</label>
            <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-sunk" />
          </FormCell>
        </FormBlock>

        <FormBlock
          title="Or paste rows"
          description="One client per line: name, email, phone. Commas or tabs both work, so you can paste straight from a spreadsheet. A header row is optional. Rows whose email already exists are skipped."
        >
          <FormCell>
            <label htmlFor="csv" className="mb-1 block text-sm font-medium text-ink">Client rows</label>
            <Textarea id="csv" name="csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={12} placeholder="name, email, phone" />
          </FormCell>
        </FormBlock>

        <FormActions>
          <Button type="submit" loading={pending}>Import clients</Button>
        </FormActions>
      </PageForm>
    </form>
  )
}

function ImportResult({ result, onReset }: { result: Extract<ImportState, { status: 'done' }>; onReset: () => void }) {
  const { created, skipped, failed } = result
  const success = created > 0
  const heading = success ? `${created} client${created === 1 ? '' : 's'} imported` : failed > 0 ? 'No clients imported' : 'Nothing new to import'
  const detail = success
    ? 'They are now in your client list.'
    : failed > 0
      ? 'None of the rows could be added.'
      : 'Every row was already a client (matched by email), so nothing new was added.'

  return (

    <div className="grid grid-cols-1 lg:grid-cols-12">
    <div className="rounded-md border border-line bg-surface p-6 lg:col-span-8">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${success ? 'bg-accent-tint text-accent-ink' : 'bg-sunk text-ink-muted'}`}>
          {success ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
          )}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{heading}</h2>
          <p className="mt-1 text-sm text-ink-muted">{detail}</p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="text-ink-muted"><span className="tabular font-semibold text-ink">{created}</span> created</span>
            <span className="text-ink-muted"><span className="tabular font-semibold text-ink">{skipped}</span> skipped</span>
            <span className="text-ink-muted"><span className="tabular font-semibold text-ink">{failed}</span> failed</span>
          </div>

          {created === 0 && failed > 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Check each line reads <span className="tabular">name, email, phone</span> with a valid email - a row without a valid email is skipped.</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {success ? (
              <Link href={`/clients?imported=${created}`} className={buttonClass()}>View clients</Link>
            ) : null}
            <Button type="button" variant="secondary" onClick={onReset}>Import more</Button>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
