'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { saveQuoteAction, sendQuoteAction, type QuoteActionState } from '../actions'

type Line = { description: string; quantity: number; unitPrice: string }

const IDLE: QuoteActionState = { status: 'idle' }

export function QuoteBuilder({
  csrf,
  projectId,
  quoteId,
  versionId,
  validUntil,
  initialLines,
}: {
  csrf: string
  projectId: string
  quoteId: string
  versionId: string
  validUntil: string
  initialLines: Line[]
}) {
  const [lines, setLines] = useState<Line[]>(
    initialLines.length > 0 ? initialLines : [{ description: '', quantity: 1, unitPrice: '' }],
  )
  const [saveState, save, saving] = useActionState(saveQuoteAction, IDLE)
  const [sendState, send, sending] = useActionState(sendQuoteAction, IDLE)

  function update(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }
  function addLine() {
    setLines((current) => [...current, { description: '', quantity: 1, unitPrice: '' }])
  }
  function removeLine(index: number) {
    setLines((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current))
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {saveState.status === 'error' ? <Alert tone="danger" title={saveState.message} /> : null}
      {saveState.status === 'success' ? <Alert tone="success" title="Draft saved" /> : null}
      {sendState.status === 'error' ? <Alert tone="danger" title={sendState.message} /> : null}

      <form action={save} className="flex flex-col gap-3">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

        <div className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-7">
                <TextInput
                  aria-label="Description"
                  placeholder="Description"
                  value={line.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <TextInput
                  aria-label="Quantity"
                  inputMode="numeric"
                  value={String(line.quantity)}
                  onChange={(event) => update(index, { quantity: Number(event.target.value) || 0 })}
                />
              </div>
              <div className="sm:col-span-2">
                <TextInput
                  aria-label="Unit price"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={line.unitPrice}
                  onChange={(event) => update(index, { unitPrice: event.target.value })}
                />
              </div>
              <div className="sm:col-span-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeLine(index)}
                  aria-label="Remove line"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            Add line
          </Button>
        </div>

        <Field label="Valid until" htmlFor="validUntil" hint="Optional. The quote expires after this date.">
          <TextInput id="validUntil" name="validUntil" type="date" defaultValue={validUntil} />
        </Field>

        <p className="text-sm text-ink-muted">Prices include GST. The total is calculated when you save.</p>

        <div>
          <Button type="submit" loading={saving}>
            Save draft
          </Button>
        </div>
      </form>

      <form action={send} className="border-t border-line pt-4">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="projectId" value={projectId} />
        <p className="text-sm text-ink-muted">Save the draft first, then send the private link to the client.</p>
        <Button type="submit" loading={sending} className="mt-3">
          Send to client
        </Button>
      </form>
    </div>
  )
}
