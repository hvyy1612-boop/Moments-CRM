'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea, TextInput } from '@/components/ui/form'
import { createInvoiceLinesAction, saveInvoiceTemplateAction, updateInvoiceLinesAction, type QuoteActionState } from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

export type PackageOption = { id: string; name: string; price: string; description: string | null; inclusions: string | null; isAddOn: boolean }
export type TemplateOption = { id: string; name: string; lines: { itemName?: string; description: string; quantity: number; unitPrice: string }[] }
export type InitialInvoice = {
  type: string
  invoiceNumber: string
  invoiceDate: string
  poNumber: string
  notes: string
  discount: string
  lines: { name: string; description: string; quantity: number; unitPrice: string; discount: string }[]
  instalments: { label: string; dueAt: string; amount: string }[]
}
type Line = { id: number; name: string; description: string; quantity: number; unitPrice: string; discount: string }
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
  invoiceId,
  initial,
}: {
  csrf: string
  projectId: string
  packages: PackageOption[]
  templates: TemplateOption[]
  invoiceId?: string
  initial?: InitialInvoice
}) {
  const editing = Boolean(invoiceId)
  const [lines, setLines] = useState<Line[]>(() => (initial?.lines ?? []).map((l, i) => ({ id: i + 1, ...l })))
  const [discount, setDiscount] = useState(initial?.discount ?? '')
  const [nextId, setNextId] = useState((initial?.lines.length ?? 0) + 1)
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? '')
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoiceDate || new Date().toISOString().slice(0, 10))
  const [poNumber, setPoNumber] = useState(initial?.poNumber ?? '')
  const [, startSave] = useTransition()
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [instalments, setInstalments] = useState<Instalment[]>(() => (initial?.instalments ?? []).map((it, i) => ({ id: i + 1, ...it })))
  const [nextInstId, setNextInstId] = useState((initial?.instalments.length ?? 0) + 1)
  const [state, action, pending] = useActionState(editing ? updateInvoiceLinesAction : createInvoiceLinesAction, IDLE)

  const basePackages = packages.filter((p) => !p.isAddOn)
  const addOns = packages.filter((p) => p.isAddOn)

  const dragIndex = useRef<number | null>(null)
  function addLine(name = '', description = '', unitPrice = '') {
    setLines((ls) => [...ls, { id: nextId, name, description, quantity: 1, unitPrice, discount: '' }])
    setNextId((n) => n + 1)
  }
  function duplicate(id: number) {
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.id === id)
      if (idx < 0) return ls
      const copy = [...ls]
      copy.splice(idx + 1, 0, { ...ls[idx]!, id: nextId })
      return copy
    })
    setNextId((n) => n + 1)
  }
  function reorder(target: number) {
    const from = dragIndex.current
    dragIndex.current = null
    if (from === null || from === target) return
    setLines((ls) => {
      const copy = [...ls]
      const [moved] = copy.splice(from, 1)
      if (moved) copy.splice(target, 0, moved)
      return copy
    })
  }
  function addPackage(id: string) {
    const pkg = packages.find((p) => p.id === id)
    if (!pkg) return
    const detail = [pkg.description, pkg.inclusions].filter(Boolean).join('\n')
    addLine(pkg.name, detail, pkg.price)
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
    setLines(t.lines.map((l) => ({ id: idc++, name: l.itemName ?? '', description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: '' })))
    setNextId(idc)
  }
  function saveTemplate() {
    const name = window.prompt('Save these items as a template. Template name:')
    if (!name) return
    const fd = new FormData()
    fd.set('csrf', csrf)
    fd.set('projectId', projectId)
    fd.set('name', name)
    fd.set('lines', JSON.stringify(lines.map((l) => ({ itemName: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }))))
    startSave(async () => { await saveInvoiceTemplateAction(fd) })
  }

  const lineAmount = (l: Line) => Math.max((Number(l.unitPrice) || 0) * l.quantity - (Number(l.discount) || 0), 0)
  const gross = lines.reduce((sum, l) => sum + lineAmount(l), 0)
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
    lines.map((l) => ({ itemName: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount || '' })),
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
      {editing ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="discount" value={disc > 0 ? String(disc) : ''} />
      <input type="hidden" name="invoiceNumber" value={invoiceNumber} />
      <input type="hidden" name="invoiceDate" value={invoiceDate} />
      <input type="hidden" name="poNumber" value={poNumber} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="instalments" value={instalmentPayload} />

      <p className="text-sm font-semibold text-ink">{editing ? 'Edit invoice' : 'New invoice'}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Invoice type" htmlFor="inv-type">
          <Select id="inv-type" name="type" defaultValue={initial?.type ?? 'DEPOSIT'}>
            <option value="DEPOSIT">Deposit</option>
            <option value="BALANCE">Balance</option>
            <option value="SUPPLEMENTARY">Supplementary</option>
          </Select>
        </Field>
        <Field label="Add a package" htmlFor="inv-pkg" hint="Fills the name, description and price.">
          <Select id="inv-pkg" value="" onChange={(e) => { addPackage(e.target.value); e.currentTarget.value = '' }}>
            <option value="" disabled>Choose a package...</option>
            {basePackages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>
            ))}
          </Select>
        </Field>
        <Field label="Add an add-on" htmlFor="inv-addon" hint="Film, Super 8, album, video add-on...">
          <Select id="inv-addon" value="" onChange={(e) => { addPackage(e.target.value); e.currentTarget.value = '' }}>
            <option value="" disabled>Choose an add-on...</option>
            {addOns.map((p) => (
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
          No items yet. Add a package or add-on above, or a custom line below.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((l, index) => (
            <div
              key={l.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorder(index)}
              className="flex flex-col gap-2 rounded border border-line p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={() => { dragIndex.current = index }}
                  aria-label="Drag to reorder"
                  className="shrink-0 cursor-grab text-muted hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
                </span>
                <TextInput aria-label="Item name" value={l.name} onChange={(e) => update(l.id, { name: e.target.value })} placeholder="Item / package name" className="flex-1" />
                <button type="button" onClick={() => duplicate(l.id)} aria-label="Duplicate item" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-ink">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                </button>
                <button type="button" onClick={() => remove(l.id)} aria-label="Remove item" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-lost-ink">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <Textarea
                aria-label="Item description"
                value={l.description}
                onChange={(e) => update(l.id, { description: e.target.value })}
                rows={l.description ? Math.min(l.description.split('\n').length + 1, 10) : 2}
                placeholder="Description - what's included (one point per line)"
              />
              <div className="flex flex-wrap items-end justify-end gap-3">
                <label className="flex flex-col text-xs text-ink-muted">Qty
                  <TextInput aria-label="Quantity" type="number" min={1} value={l.quantity} onChange={(e) => update(l.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-20" />
                </label>
                <label className="flex flex-col text-xs text-ink-muted">Unit price
                  <TextInput aria-label="Unit price" inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.id, { unitPrice: e.target.value })} placeholder="0.00" className="mt-1 w-28" />
                </label>
                <label className="flex flex-col text-xs text-ink-muted">Discount
                  <TextInput aria-label="Line discount" inputMode="decimal" value={l.discount} onChange={(e) => update(l.id, { discount: e.target.value })} placeholder="0.00" className="mt-1 w-28" />
                </label>
                <div className="pb-1.5 text-right">
                  <div className="text-xs text-muted">Amount</div>
                  <div className="tabular text-sm font-semibold text-ink">{money(lineAmount(l))}</div>
                </div>
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
          {editing ? 'Save changes' : 'Raise invoice'}
        </Button>
      </div>
    </form>
  )
}
