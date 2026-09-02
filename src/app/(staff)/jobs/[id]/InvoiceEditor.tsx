'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
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
export type JobContext = { name: string; type: string | null; shootLabel: string | null; location: string | null }
export type ClientContext = { name: string; email: string | null; phone: string | null; address: string | null }
type Line = { id: number; name: string; description: string; quantity: number; unitPrice: string; discount: string }
type Instalment = { id: number; label: string; dueAt: string; amount: string }
type Draft = { name: string; description: string; quantity: number; unitPrice: string; discount: string }

const EMPTY_DRAFT: Draft = { name: '', description: '', quantity: 1, unitPrice: '', discount: '' }

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
function money(n: number): string {
  return aud.format(Number.isFinite(n) ? n : 0)
}
function amountOf(l: { unitPrice: string; quantity: number; discount: string }): number {
  return Math.max((Number(l.unitPrice) || 0) * l.quantity - (Number(l.discount) || 0), 0)
}

/**
 * Invoice builder (Studio-Ninja style). Items live in a Products & Packages table; the "Add Products
 * & Packages" button opens an Add Item modal where choosing a catalogue package fills the name,
 * description and price. The server recomputes every amount with Decimal, so this preview never
 * drives the stored figures.
 */
export function InvoiceEditor({
  csrf,
  projectId,
  packages,
  templates,
  invoiceId,
  initial,
  job,
  client,
  amountPaid,
}: {
  csrf: string
  projectId: string
  packages: PackageOption[]
  templates: TemplateOption[]
  invoiceId?: string
  initial?: InitialInvoice
  job?: JobContext
  client?: ClientContext
  amountPaid?: string
}) {
  const editing = Boolean(invoiceId)
  const workspace = Boolean(job || client)
  const paidNum = Number(amountPaid) || 0
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

  // Add Item modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  const basePackages = packages.filter((p) => !p.isAddOn)
  const addOns = packages.filter((p) => p.isAddOn)

  const dragIndex = useRef<number | null>(null)

  function openAdd() {
    setEditId(null)
    setDraft(EMPTY_DRAFT)
    setModalOpen(true)
  }
  function openEdit(l: Line) {
    setEditId(l.id)
    setDraft({ name: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
  }
  function choosePackage(id: string) {
    const pkg = packages.find((p) => p.id === id)
    if (!pkg) return
    const detail = [pkg.description, pkg.inclusions].filter(Boolean).join('\n')
    setDraft((d) => ({ ...d, name: pkg.name, description: detail, unitPrice: pkg.price }))
  }
  function saveItem() {
    if (!draft.name.trim()) return
    if (editId === null) {
      setLines((ls) => [...ls, { id: nextId, ...draft }])
      setNextId((n) => n + 1)
    } else {
      setLines((ls) => ls.map((l) => (l.id === editId ? { ...l, ...draft } : l)))
    }
    setModalOpen(false)
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

  const gross = lines.reduce((sum, l) => sum + amountOf(l), 0)
  const disc = Math.min(Number(discount) || 0, gross)
  const total = Math.max(gross - disc, 0)
  const gst = total / 11
  const subtotal = total - gst
  const dueDates = instalments.map((it) => it.dueAt).filter(Boolean).sort()
  const dueDisplay = dueDates.length > 0 ? dueDates[dueDates.length - 1]! : 'On issue'

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

  useEffect(() => {
    if (!modalOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setModalOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const payload = JSON.stringify(
    lines.map((l) => ({ itemName: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount || '' })),
  )
  const instalmentPayload = JSON.stringify(
    instalments.map((it) => ({ label: it.label, dueAt: it.dueAt, amount: it.amount || '0' })),
  )

  return (
    <>
      <form action={action} className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
        {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
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

        {workspace ? null : <p className="text-sm font-semibold text-ink">{editing ? 'Edit invoice' : 'New invoice'}</p>}

        {workspace ? (
          /* Invoice · Job · Client context grid */
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-md border border-line bg-surface p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Invoice</div>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col text-xs text-ink-muted">Type
                  <Select name="type" defaultValue={initial?.type ?? 'DEPOSIT'} className="mt-1 h-9">
                    <option value="DEPOSIT">Deposit</option>
                    <option value="BALANCE">Balance</option>
                    <option value="SUPPLEMENTARY">Supplementary</option>
                  </Select>
                </label>
                <label className="flex flex-col text-xs text-ink-muted">Invoice number
                  <TextInput value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto (INV-...)" maxLength={30} className="mt-1 h-9" />
                </label>
                <label className="flex flex-col text-xs text-ink-muted">Issue date
                  <TextInput type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1 h-9" />
                </label>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-muted">Due date</span>
                  <span className="text-sm text-ink">{dueDisplay}</span>
                </div>
                <label className="flex flex-col text-xs text-ink-muted">PO number
                  <TextInput value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="-" maxLength={60} className="mt-1 h-9" />
                </label>
              </div>
            </div>

            <div className="rounded-md border border-line bg-surface p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Job</div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <div className="font-medium text-ink">{job?.name}</div>
                {job?.type ? <div><span className="text-ink-muted">Type</span> · <span className="text-ink">{job.type}</span></div> : null}
                {job?.shootLabel ? <div><span className="text-ink-muted">Main shoot</span><br /><span className="text-ink">{job.shootLabel}</span></div> : null}
                {job?.location ? <div><span className="text-ink-muted">Location</span><br /><span className="text-ink">{job.location}</span></div> : null}
              </div>
            </div>

            <div className="rounded-md border border-line bg-surface p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Client</div>
              <div className="mt-3 flex flex-col gap-1 text-sm">
                <div className="font-medium text-ink">{client?.name}</div>
                {client?.email ? <div className="text-ink-muted">{client.email}</div> : null}
                {client?.phone ? <div className="text-ink-muted">{client.phone}</div> : null}
                {client?.address ? <div className="whitespace-pre-line text-ink-muted">{client.address}</div> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Invoice type" htmlFor="inv-type">
              <Select id="inv-type" name="type" defaultValue={initial?.type ?? 'DEPOSIT'}>
                <option value="DEPOSIT">Deposit</option>
                <option value="BALANCE">Balance</option>
                <option value="SUPPLEMENTARY">Supplementary</option>
              </Select>
            </Field>
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
        )}

        {/* Products & Packages */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Products &amp; packages</p>
            {templates.length > 0 ? (
              <Select aria-label="Apply a template" value="" onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = '' }} className="h-8 max-w-xs">
                <option value="" disabled>Apply a template...</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <p className="mt-2 rounded border border-dashed border-line px-3 py-6 text-center text-sm text-ink-muted">
              No items yet. Use <span className="font-semibold text-ink">Add products &amp; packages</span> to add one.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Discount</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, index) => (
                    <tr
                      key={l.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => reorder(index)}
                      className="border-b border-line align-top last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-1.5">
                          <span
                            draggable
                            onDragStart={() => { dragIndex.current = index }}
                            aria-label="Drag to reorder"
                            className="mt-0.5 shrink-0 cursor-grab text-muted hover:text-ink"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
                          </span>
                          <span className="font-medium text-ink">{l.name || <span className="text-ink-muted">Untitled item</span>}</span>
                        </div>
                      </td>
                      <td className="max-w-sm whitespace-pre-line px-3 py-2 text-ink-muted">{l.description || '-'}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-muted">{money(Number(l.unitPrice) || 0)}</td>
                      <td className="tabular px-3 py-2 text-center text-ink-muted">{l.quantity}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-muted">{Number(l.discount) > 0 ? `-${money(Number(l.discount))}` : '-'}</td>
                      <td className="tabular px-3 py-2 text-right font-medium text-ink">{money(amountOf(l))}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => openEdit(l)} aria-label="Edit item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
                          </button>
                          <button type="button" onClick={() => duplicate(l.id)} aria-label="Duplicate item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                          </button>
                          <button type="button" onClick={() => remove(l.id)} aria-label="Remove item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-danger">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={openAdd}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add products &amp; packages
            </Button>
            {lines.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={saveTemplate}>Save as template</Button>
            ) : null}
            <div className="flex items-center gap-2">
              <label htmlFor="inv-discount" className="text-sm text-ink-muted">Discount</label>
              <TextInput id="inv-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="h-8 w-28" />
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="ml-auto w-full max-w-xs border-t border-line pt-2 text-sm">
          <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular">{money(subtotal)}</span></div>
          <div className="flex justify-between py-0.5 text-ink-muted"><span>GST (10%)</span><span className="tabular">{money(gst)}</span></div>
          {disc > 0 ? <div className="flex justify-between py-0.5 text-ink-muted"><span>Discount</span><span className="tabular">-{money(disc)}</span></div> : null}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total (incl. GST)</span><span className="tabular">{money(total)}</span></div>
          {workspace ? (
            <>
              <div className="flex justify-between py-0.5 text-ink-muted"><span>Paid</span><span className="tabular text-delivered-ink">{money(paidNum)}</span></div>
              <div className="flex justify-between py-0.5 font-semibold text-ink"><span>Balance</span><span className="tabular">{money(Math.max(total - paidNum, 0))}</span></div>
            </>
          ) : null}
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
                    <button type="button" onClick={() => removeInst(it.id)} aria-label="Remove instalment" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-danger">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              <p className={`text-xs ${scheduleMismatch ? 'font-bold text-danger' : 'text-ink-muted'}`}>
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

      {/* Add Item modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={closeModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editId === null ? 'Add item' : 'Edit item'}
            className="my-8 w-full max-w-xl rounded-md border border-line bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-ink">{editId === null ? 'Add item' : 'Edit item'}</h2>
              <button type="button" onClick={closeModal} aria-label="Close" className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink">×</button>
            </div>
            <p className="mb-4 text-sm text-ink-muted">Add a product or package to your invoice.</p>

            <div className="flex flex-col gap-3">
              <Field label="Choose existing product / package" htmlFor="modal-pkg" hint="Fills the name, description and price - you can still edit them.">
                <Select id="modal-pkg" value="" onChange={(e) => { choosePackage(e.target.value); e.currentTarget.value = '' }}>
                  <option value="">Choose existing product / package...</option>
                  {basePackages.length > 0 ? (
                    <optgroup label="Packages">
                      {basePackages.map((p) => <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>)}
                    </optgroup>
                  ) : null}
                  {addOns.length > 0 ? (
                    <optgroup label="Add-ons">
                      {addOns.map((p) => <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>)}
                    </optgroup>
                  ) : null}
                </Select>
              </Field>

              <Field label="Product / package name" htmlFor="modal-name">
                <TextInput id="modal-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Enter a product / package name" maxLength={200} />
              </Field>

              <Field label="Description" htmlFor="modal-desc" hint="One inclusion per line - shown on the invoice.">
                <Textarea id="modal-desc" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={7} maxLength={500} placeholder="What's included..." />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Quantity" htmlFor="modal-qty">
                  <TextInput id="modal-qty" type="number" min={1} value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Number(e.target.value) || 1) }))} />
                </Field>
                <Field label="Unit price" htmlFor="modal-unit">
                  <TextInput id="modal-unit" inputMode="decimal" value={draft.unitPrice} onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))} placeholder="0.00" />
                </Field>
                <Field label="Discount" htmlFor="modal-disc">
                  <TextInput id="modal-disc" inputMode="decimal" value={draft.discount} onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))} placeholder="0.00" />
                </Field>
              </div>

              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-muted">Amount <span className="tabular ml-1 font-semibold text-ink">{money(amountOf(draft))}</span></span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={closeModal}>Cancel</Button>
                  <Button type="button" size="sm" onClick={saveItem} disabled={!draft.name.trim()}>Save item</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
