'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/form'
import { createInvoiceLinesAction, type QuoteActionState } from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

export type PackageOption = { id: string; name: string; price: string }
type Line = { id: number; description: string; quantity: number; unitPrice: string }

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
function money(n: number): string {
  return aud.format(Number.isFinite(n) ? n : 0)
}

/**
 * Multi-line invoice builder (Studio-Ninja style): add packages from the catalogue or custom lines,
 * set quantity, apply a whole-invoice discount, and see the GST-inclusive totals live. The server
 * recomputes every amount with Decimal, so this preview never drives the stored figures.
 */
export function InvoiceEditor({
  csrf,
  projectId,
  packages,
}: {
  csrf: string
  projectId: string
  packages: PackageOption[]
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState('')
  const [nextId, setNextId] = useState(1)
  const [state, action, pending] = useActionState(createInvoiceLinesAction, IDLE)

  function addLine(description = '', unitPrice = '') {
    setLines((ls) => [...ls, { id: nextId, description, quantity: 1, unitPrice }])
    setNextId((n) => n + 1)
  }
  function addPackage(id: string) {
    const pkg = packages.find((p) => p.id === id)
    if (pkg) addLine(pkg.name, pkg.price)
  }
  function update(id: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function remove(id: number) {
    setLines((ls) => ls.filter((l) => l.id !== id))
  }

  const gross = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * l.quantity, 0)
  const disc = Math.min(Number(discount) || 0, gross)
  const total = Math.max(gross - disc, 0)
  const gst = total / 11
  const subtotal = total - gst

  const payload = JSON.stringify(
    lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
  )

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Alert tone="success" title="Invoice raised" /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="discount" value={disc > 0 ? String(disc) : ''} />

      <p className="text-sm font-semibold text-ink">New invoice</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Invoice type" htmlFor="inv-type">
          <Select id="inv-type" name="type" defaultValue="DEPOSIT">
            <option value="DEPOSIT">Deposit</option>
            <option value="BALANCE">Balance</option>
            <option value="SUPPLEMENTARY">Supplementary</option>
          </Select>
        </Field>
        <Field label="Add a package" htmlFor="inv-pkg" hint="Pick a package to add it as a line.">
          <Select id="inv-pkg" value="" onChange={(e) => { addPackage(e.target.value); e.currentTarget.value = '' }}>
            <option value="" disabled>Choose a package...</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Line items */}
      {lines.length === 0 ? (
        <p className="rounded border border-dashed border-line px-3 py-4 text-center text-sm text-ink-muted">
          No items yet. Add a package above or a custom line below.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-1 gap-2 rounded border border-line p-2 sm:grid-cols-12 sm:items-center">
              <div className="sm:col-span-6">
                <TextInput aria-label="Item description" value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} placeholder="Item / package" />
              </div>
              <div className="sm:col-span-2">
                <TextInput aria-label="Quantity" type="number" min={1} value={l.quantity} onChange={(e) => update(l.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div className="sm:col-span-2">
                <TextInput aria-label="Unit price" inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.id, { unitPrice: e.target.value })} placeholder="0.00" />
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-2 sm:justify-end">
                <span className="tabular text-sm text-ink">{money((Number(l.unitPrice) || 0) * l.quantity)}</span>
                <button type="button" onClick={() => remove(l.id)} aria-label="Remove item" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-lost-ink">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => addLine()}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Add custom line
        </Button>
        <div className="flex items-center gap-2">
          <label htmlFor="inv-discount" className="text-sm text-ink-muted">Discount</label>
          <TextInput id="inv-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="h-8 w-28" />
        </div>
      </div>

      {/* Totals */}
      <div className="ml-auto w-full max-w-xs border-t border-line pt-2 text-sm">
        <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular">{money(subtotal)}</span></div>
        <div className="flex justify-between py-0.5 text-ink-muted"><span>GST (10%)</span><span className="tabular">{money(gst)}</span></div>
        {disc > 0 ? <div className="flex justify-between py-0.5 text-ink-muted"><span>Discount</span><span className="tabular">-{money(disc)}</span></div> : null}
        <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total (incl. GST)</span><span className="tabular">{money(total)}</span></div>
      </div>

      <div>
        <Button type="submit" loading={pending} disabled={lines.length === 0}>
          Raise invoice
        </Button>
      </div>
    </form>
  )
}
