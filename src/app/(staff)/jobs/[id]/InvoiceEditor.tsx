'use client'

import { useActionState, useState, useTransition } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea, TextInput } from '@/components/ui/form'
import { createInvoiceLinesAction, saveInvoiceTemplateAction, type QuoteActionState } from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

export type PackageOption = { id: string; name: string; price: string }
export type TemplateOption = { id: string; name: string; lines: { description: string; quantity: number; unitPrice: string }[] }
type Line = { id: number; description: string; quantity: number; unitPrice: string }
type Instalment = { id: number; label: string; dueAt: string; amount: string }

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
  templates,
}: {
  csrf: string
  projectId: string
  packages: PackageOption[]
  templates: TemplateOption[]
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState('')
  const [nextId, setNextId] = useState(1)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [poNumber, setPoNumber] = useState('')
  const [, startSave] = useTransition()
  const [notes, setNotes] = useState('')
  const [instalments, setInstalments] = useState<Instalment[]>([])
  const [nextInstId, setNextInstId] = useState(1)
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
  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    let idc = nextId
    setLines(t.lines.map((l) => ({ id: idc++, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })))
    setNextId(idc)
  }
  function saveTemplate() {
    const name = window.prompt('Save these items as a template. Template name:')
    if (!name) return
    const fd = new FormData()
    fd.set('csrf', csrf)
    fd.set('projectId', projectId)
    fd.set('name', name)
    fd.set('lines', JSON.stringify(lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }))))
    startSave(async () => { await saveInvoiceTemplateAction(fd) })
  }

  const gross = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * l.quantity, 0)
  const disc = Math.min(Number(discount) || 0, gross)
  const total = Math.max(gross - disc, 0)
  const gst = total / 11
  const subtotal = total - gst

  const scheduled = instalments.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const scheduleMismatch = instalments.length > 0 && Math.abs(scheduled - total) > 0.005

  function genFull() {
    setInstalments([{ id: nextInstId, label: 'Full payment', dueAt: invoiceDate, amount: total.toFixed(2) }])
    setNextInstId((n) => n + 1)
  }
  function genDeposit() {
    const half = Math.round((total / 2) * 100) / 100
    setInstalments([
      { id: nextInstId, label: 'Deposit (50%)', dueAt: invoiceDate, amount: half.toFixed(2) },
      { id: nextInstId + 1, label: 'Balance (50%)', dueAt: '', amount: (total - half).toFixed(2) },
    ])
    setNextInstId((n) => n + 2)
  }
  function addInst() {
    setInstalments((is) => [...is, { id: nextInstId, label: '', dueAt: '', amount: '' }])
    setNextInstId((n) => n + 1)
  }
  function updateInst(id: number, patch: Partial<Instalment>) {
    setInstalments((is) => is.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }
  function removeInst(id: number) {
    setInstalments((is) => is.filter((it) => it.id !== id))
  }

  const payload = JSON.stringify(
    lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
  )
  const instalmentPayload = JSON.stringify(
    instalments.map((it) => ({ label: it.label, dueAt: it.dueAt, amount: it.amount || '0' })),
  )

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Alert tone="success" title="Invoice raised" /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="discount" value={disc > 0 ? String(disc) : ''} />
      <input type="hidden" name="invoiceNumber" value={invoiceNumber} />
      <input type="hidden" name="invoiceDate" value={invoiceDate} />
      <input type="hidden" name="poNumber" value={poNumber} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="instalments" value={instalmentPayload} />

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Invoice number" htmlFor="inv-num" hint="Blank = auto (INV-...).">
          <TextInput id="inv-num" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto" maxLength={30} />
        </Field>
        <Field label="Issue date" htmlFor="inv-date">
          <TextInput id="inv-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </Field>
        <Field label="PO number (optional)" htmlFor="inv-po">
          <TextInput id="inv-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="-" maxLength={60} />
        </Field>
      </div>

      {templates.length > 0 || lines.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 ? (
            <Select aria-label="Apply a template" value="" onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = '' }} className="h-8 max-w-xs">
              <option value="" disabled>Apply a template...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={saveTemplate} disabled={lines.length === 0}>Save as template</Button>
        </div>
      ) : null}

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

      {/* Payment schedule */}
      <div className="border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Payment schedule</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={genFull}>Full payment</Button>
            <Button type="button" variant="secondary" size="sm" onClick={genDeposit}>50% + 50%</Button>
            <Button type="button" variant="secondary" size="sm" onClick={addInst}>Add instalment</Button>
          </div>
        </div>
        {instalments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No split - a single full payment on issue.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {instalments.map((it) => (
              <div key={it.id} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                <div className="sm:col-span-5"><TextInput aria-label="Instalment label" value={it.label} onChange={(e) => updateInst(it.id, { label: e.target.value })} placeholder="Deposit" /></div>
                <div className="sm:col-span-4"><TextInput aria-label="Due date" type="date" value={it.dueAt} onChange={(e) => updateInst(it.id, { dueAt: e.target.value })} /></div>
                <div className="sm:col-span-2"><TextInput aria-label="Instalment amount" inputMode="decimal" value={it.amount} onChange={(e) => updateInst(it.id, { amount: e.target.value })} placeholder="0.00" /></div>
                <div className="flex justify-end sm:col-span-1">
                  <button type="button" onClick={() => removeInst(it.id)} aria-label="Remove instalment" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-lost-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </div>
            ))}
            <p className={`text-xs ${scheduleMismatch ? 'font-bold text-lost-ink' : 'text-ink-muted'}`}>
              Scheduled {money(scheduled)} of {money(total)}{scheduleMismatch ? ' - must match the total' : ''}
            </p>
          </div>
        )}
      </div>

      <Field label="Notes (optional)" htmlFor="inv-notes">
        <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Notes shown on the invoice..." />
      </Field>

      <div>
        <Button type="submit" loading={pending} disabled={lines.length === 0 || scheduleMismatch}>
          Raise invoice
        </Button>
      </div>
    </form>
  )
}
