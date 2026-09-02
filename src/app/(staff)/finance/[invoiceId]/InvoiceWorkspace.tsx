'use client'

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea, TextInput } from '@/components/ui/form'
import { recordPaymentAction, saveInvoiceContentAction, type QuoteActionState } from '../../jobs/actions'
import { RefundButton } from './RefundButton'

const IDLE: QuoteActionState = { status: 'idle' }

export type WPackage = { id: string; name: string; price: string; description: string | null; inclusions: string | null; isAddOn: boolean }
export type WLine = { name: string; description: string; quantity: number; unitPrice: string; discount: string }
export type WJob = { id: string; name: string; subtype: string | null; shootLabel: string | null; location: string | null }
export type WClient = { name: string; email: string | null; phone: string | null; address: string | null }
export type WPaymentRow = { id: string; dateLabel: string; amountLabel: string; refundedLabel: string | null; method: string; reference: string | null; statusLabel: string; refundable: string; canRefund: boolean }

type Line = WLine & { id: number }
type Draft = { name: string; description: string; quantity: number; unitPrice: string; discount: string }
const EMPTY_DRAFT: Draft = { name: '', description: '', quantity: 1, unitPrice: '', discount: '' }

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const money = (n: number) => aud.format(Number.isFinite(n) ? n : 0)
const amountOf = (l: { unitPrice: string; quantity: number; discount: string }) =>
  Math.max((Number(l.unitPrice) || 0) * l.quantity - (Number(l.discount) || 0), 0)

function CardHeader({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {action}
    </div>
  )
}
const svg = { className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }

export function InvoiceWorkspace(props: {
  csrf: string
  invoiceId: string
  projectId: string
  editable: boolean
  canPay: boolean
  amountPaid: number
  initial: { type: string; invoiceNumber: string; invoiceDate: string; poNumber: string; notes: string; discount: string; lines: WLine[]; split: boolean }
  job: WJob
  client: WClient
  packages: WPackage[]
  paymentRows: WPaymentRow[]
}) {
  const { csrf, invoiceId, projectId, editable, canPay, amountPaid, initial, job, client, packages, paymentRows } = props
  const router = useRouter()

  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l, i) => ({ id: i + 1, ...l })))
  const [nextId, setNextId] = useState(initial.lines.length + 1)
  const [discount, setDiscount] = useState(initial.discount)
  const [type, setType] = useState(initial.type)
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber)
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate)
  const [poNumber, setPoNumber] = useState(initial.poNumber)
  const [notes] = useState(initial.notes)
  const [split, setSplit] = useState(initial.split)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const [addMenu, setAddMenu] = useState(false)
  const addWrap = useRef<HTMLDivElement>(null)
  const [itemOpen, setItemOpen] = useState(false)
  const [itemEditId, setItemEditId] = useState<number | null>(null)
  const [withPackages, setWithPackages] = useState(true)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showDiscount, setShowDiscount] = useState(Number(initial.discount) > 0)

  const dragIndex = useRef<number | null>(null)
  const basePackages = packages.filter((p) => !p.isAddOn)
  const addOns = packages.filter((p) => p.isAddOn)

  const gross = lines.reduce((s, l) => s + amountOf(l), 0)
  const disc = Math.min(Number(discount) || 0, gross)
  const total = Math.max(gross - disc, 0)
  const gst = total / 11
  const subtotal = total - gst
  const balance = Math.max(total - amountPaid, 0)

  function scheduleFor(useSplit: boolean, forTotal: number) {
    if (!useSplit) return [] as { label: string; dueAt: string; amount: string }[]
    const half = Math.round((forTotal / 2) * 100) / 100
    return [
      { label: 'Deposit (50%)', dueAt: invoiceDate, amount: half.toFixed(2) },
      { label: 'Balance (50%)', dueAt: '', amount: (forTotal - half).toFixed(2) },
    ]
  }

  function persist(next: Partial<{ lines: Line[]; discount: string; type: string; invoiceNumber: string; invoiceDate: string; poNumber: string; split: boolean }>) {
    const nLines = next.lines ?? lines
    const nDiscount = next.discount ?? discount
    const nSplit = next.split ?? split
    const nGross = nLines.reduce((s, l) => s + amountOf(l), 0)
    const nDisc = Math.min(Number(nDiscount) || 0, nGross)
    const nTotal = Math.max(nGross - nDisc, 0)
    const fd = new FormData()
    fd.set('csrf', csrf)
    fd.set('invoiceId', invoiceId)
    fd.set('type', next.type ?? type)
    fd.set('invoiceNumber', next.invoiceNumber ?? invoiceNumber)
    fd.set('invoiceDate', next.invoiceDate ?? invoiceDate)
    fd.set('poNumber', next.poNumber ?? poNumber)
    fd.set('notes', notes)
    fd.set('discount', nDisc > 0 ? String(nDisc) : '')
    fd.set('lines', JSON.stringify(nLines.map((l) => ({ itemName: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount || '' }))))
    fd.set('instalments', JSON.stringify(scheduleFor(nSplit, nTotal)))
    setError(null)
    startSave(async () => {
      const res = await saveInvoiceContentAction(IDLE, fd)
      if (res.status === 'error') setError(res.message)
      else router.refresh()
    })
  }

  // ---- item actions ----
  function openAdd(pkg: boolean) { setItemEditId(null); setWithPackages(pkg); setDraft(EMPTY_DRAFT); setItemOpen(true); setAddMenu(false) }
  function openEdit(l: Line) { setItemEditId(l.id); setWithPackages(true); setDraft({ name: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount }); setItemOpen(true) }
  function choosePackage(id: string) {
    const p = packages.find((x) => x.id === id); if (!p) return
    setDraft((d) => ({ ...d, name: p.name, description: [p.description, p.inclusions].filter(Boolean).join('\n'), unitPrice: p.price }))
  }
  function saveItem() {
    if (!draft.name.trim()) return
    const nLines = itemEditId === null
      ? [...lines, { id: nextId, ...draft }]
      : lines.map((l) => (l.id === itemEditId ? { ...l, ...draft } : l))
    if (itemEditId === null) setNextId((n) => n + 1)
    setLines(nLines); setItemOpen(false); persist({ lines: nLines })
  }
  function duplicate(id: number) {
    const idx = lines.findIndex((l) => l.id === id); if (idx < 0) return
    const copy = [...lines]; copy.splice(idx + 1, 0, { ...lines[idx]!, id: nextId })
    setNextId((n) => n + 1); setLines(copy); persist({ lines: copy })
  }
  function removeLine(id: number) {
    const nLines = lines.filter((l) => l.id !== id); setLines(nLines); persist({ lines: nLines })
  }
  function reorder(target: number) {
    const from = dragIndex.current; dragIndex.current = null
    if (from === null || from === target) return
    const copy = [...lines]; const [m] = copy.splice(from, 1); if (m) copy.splice(target, 0, m)
    setLines(copy); persist({ lines: copy })
  }

  useEffect(() => {
    if (!addMenu) return
    function onDoc(e: MouseEvent) { if (addWrap.current && !addWrap.current.contains(e.target as Node)) setAddMenu(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [addMenu])
  useEffect(() => {
    if (!itemOpen && !detailsOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setItemOpen(false); setDetailsOpen(false) } }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [itemOpen, detailsOpen])

  const scheduleRows = split ? scheduleFor(true, total) : [{ label: 'Full payment', dueAt: invoiceDate, amount: total.toFixed(2) }]

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger" title={error} /> : null}

      {/* Invoice / Job / Client */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface">
          <CardHeader
            icon={<svg {...svg}><path d="M6 3h9l3 3v15l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></svg>}
            title="Invoice details"
            action={editable ? <button type="button" onClick={() => setDetailsOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"><svg {...svg} className="h-3.5 w-3.5"><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>Edit</button> : null}
          />
          <dl className="flex flex-col gap-2.5 p-4 text-sm">
            <Row label="Invoice ID" value={invoiceNumber || 'Auto'} />
            <Row label="Issue date" value={invoiceDate || '-'} />
            <Row label="PO number" value={poNumber || '-'} />
            <Row label="Due date" value={split ? '25% deposit + balance' : (invoiceDate || 'On issue')} />
            <Row label="Type" value={type.toLowerCase()} valueClass="capitalize" />
          </dl>
        </div>

        <div className="rounded-lg border border-line bg-surface">
          <CardHeader
            icon={<svg {...svg}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
            title="Job details"
            action={<Link href={`/jobs/${job.id}`} className="text-xs font-semibold text-accent hover:underline">Open</Link>}
          />
          <dl className="flex flex-col gap-2.5 p-4 text-sm">
            <Row label="Job" value={job.name} />
            {job.subtype ? <Row label="Type" value={job.subtype} /> : null}
            {job.shootLabel ? <Row label="Main shoot" value={job.shootLabel} /> : null}
            {job.location ? <Row label="Location" value={job.location} /> : null}
          </dl>
        </div>

        <div className="rounded-lg border border-line bg-surface">
          <CardHeader
            icon={<svg {...svg}><path d="M4 20a8 8 0 0 1 16 0" /><circle cx="12" cy="8" r="4" /></svg>}
            title="Client"
          />
          <div className="flex flex-col gap-1.5 p-4 text-sm">
            <div className="font-medium text-ink">{client.name}</div>
            {client.email ? <div className="text-ink-muted">{client.email}</div> : null}
            {client.phone ? <div className="text-ink-muted">{client.phone}</div> : null}
            {client.address ? <div className="whitespace-pre-line text-ink-muted">{client.address}</div> : null}
          </div>
        </div>
      </div>

      {/* Products & Packages + totals */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface">
          <CardHeader
            icon={<svg {...svg}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></svg>}
            title="Products & packages"
            action={editable ? (
              <div ref={addWrap} className="relative">
                <Button type="button" size="sm" onClick={() => setAddMenu((v) => !v)}>
                  Add to invoice
                  <svg {...svg} className="h-3.5 w-3.5"><path d="m6 9 6 6 6-6" /></svg>
                </Button>
                {addMenu ? (
                  <div className="absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
                    <button type="button" onClick={() => openAdd(true)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Product or package</button>
                    <button type="button" onClick={() => openAdd(false)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Custom charge</button>
                    <button type="button" onClick={() => { setShowDiscount(true); setAddMenu(false) }} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Discount</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  {editable ? <th className="px-3 py-2"></th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={editable ? 7 : 6} className="px-4 py-6 text-center text-sm text-ink-muted">No items yet.</td></tr>
                ) : lines.map((l, index) => (
                  <tr key={l.id} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(index)} className="border-b border-line align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        {editable ? (
                          <span draggable onDragStart={() => { dragIndex.current = index }} aria-label="Drag to reorder" className="mt-0.5 shrink-0 cursor-grab text-muted hover:text-ink">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
                          </span>
                        ) : null}
                        <span className="font-medium text-ink">{l.name || <span className="text-ink-muted">Untitled</span>}</span>
                      </div>
                    </td>
                    <td className="max-w-sm whitespace-pre-line px-3 py-3 text-ink-muted">{l.description || '-'}</td>
                    <td className="tabular px-3 py-3 text-right text-ink-muted">{money(Number(l.unitPrice) || 0)}</td>
                    <td className="tabular px-3 py-3 text-center text-ink-muted">{l.quantity}</td>
                    <td className="tabular px-3 py-3 text-right text-ink-muted">{Number(l.discount) > 0 ? `-${money(Number(l.discount))}` : '-'}</td>
                    <td className="tabular px-3 py-3 text-right font-medium text-ink">{money(amountOf(l))}</td>
                    {editable ? (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => openEdit(l)} aria-label="Edit item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink"><svg {...svg}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg></button>
                          <button type="button" onClick={() => duplicate(l.id)} aria-label="Duplicate item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink"><svg {...svg}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg></button>
                          <button type="button" onClick={() => removeLine(l.id)} aria-label="Remove item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-danger"><svg {...svg}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editable && showDiscount ? (
            <div className="flex items-center gap-2 border-t border-line px-4 py-3">
              <label htmlFor="ws-discount" className="text-sm text-ink-muted">Whole-invoice discount</label>
              <TextInput id="ws-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} onBlur={() => persist({ discount })} placeholder="0.00" className="h-8 w-28" />
            </div>
          ) : null}
        </div>

        <div className="w-full rounded-lg border border-line bg-surface p-4 text-sm lg:w-72 lg:shrink-0">
          <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular">{money(subtotal)}</span></div>
          {disc > 0 ? <div className="flex justify-between py-0.5 text-ink-muted"><span>Discount</span><span className="tabular">-{money(disc)}</span></div> : null}
          <div className="flex justify-between py-0.5 text-ink-muted"><span>GST (10%)</span><span className="tabular">{money(gst)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold text-ink"><span>Total due</span><span className="tabular">{money(total)}</span></div>
          <div className="mt-1 flex justify-between py-0.5 text-ink-muted"><span>Paid</span><span className="tabular text-delivered-ink">{money(amountPaid)}</span></div>
          <div className="flex justify-between py-0.5 font-semibold text-ink"><span>Balance</span><span className="tabular">{money(balance)}</span></div>
        </div>
      </div>

      {/* Bottom: Schedule | History | Record */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface">
          <CardHeader icon={<svg {...svg}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>} title="Payment schedule" />
          <div className="p-4">
            <Select aria-label="Payment schedule" value={split ? 'deposit' : 'none'} disabled={!editable} onChange={(e) => { const s = e.target.value === 'deposit'; setSplit(s); persist({ split: s }) }} className="h-9">
              <option value="none">No split payments</option>
              <option value="deposit">50% deposit + 50% balance</option>
            </Select>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2">#</th><th className="py-2">Due</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {scheduleRows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-b-0"><td className="py-2 text-ink-muted">{i + 1}</td><td className="py-2 text-ink-muted">{r.dueAt || 'On issue'}</td><td className="tabular py-2 text-right text-ink">{money(Number(r.amount))}</td></tr>
                ))}
                <tr><td className="py-2 font-semibold text-ink" colSpan={2}>Total</td><td className="tabular py-2 text-right font-semibold text-ink">{money(total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface">
          <CardHeader icon={<svg {...svg}><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>} title="Payments history" />
          <div className="p-4">
            {paymentRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No payments recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2">Date</th><th className="py-2 text-right">Amount</th><th className="py-2">Method</th><th className="py-2"></th></tr></thead>
                <tbody>
                  {paymentRows.map((p) => (
                    <tr key={p.id} className="border-b border-line align-top last:border-b-0">
                      <td className="py-2 text-ink-muted">{p.dateLabel}</td>
                      <td className="tabular py-2 text-right text-ink">{p.amountLabel}{p.refundedLabel ? <div className="text-xs text-danger">-{p.refundedLabel}</div> : null}</td>
                      <td className="py-2 text-ink-muted">{p.method}{p.reference ? <div className="text-xs text-ink-muted">{p.reference}</div> : null}</td>
                      <td className="py-2 text-right">{p.canRefund ? <RefundButton csrf={csrf} paymentId={p.id} invoiceId={invoiceId} refundable={p.refundable} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface">
          <CardHeader icon={<svg {...svg}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>} title="Record a payment" />
          <div className="p-4">
            {canPay ? (
              <RecordPayment csrf={csrf} projectId={projectId} invoiceId={invoiceId} balanceLabel={money(balance)} />
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">{amountPaid > 0 ? 'This invoice is settled.' : 'Issue the invoice (More actions) before recording a payment.'}</p>
            )}
          </div>
        </div>
      </div>

      {saving ? <p className="text-xs text-ink-muted">Saving...</p> : null}

      {/* Add / edit item modal */}
      {itemOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={() => setItemOpen(false)}>
          <div role="dialog" aria-modal="true" className="my-8 w-full max-w-xl rounded-md border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-ink">{itemEditId === null ? 'Add item' : 'Edit item'}</h2>
              <button type="button" onClick={() => setItemOpen(false)} aria-label="Close" className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink">×</button>
            </div>
            <p className="mb-4 text-sm text-ink-muted">Add a product or package to your invoice.</p>
            <div className="flex flex-col gap-3">
              {withPackages ? (
                <Field label="Choose existing product / package" htmlFor="ws-pkg" hint="Fills the name, description and price.">
                  <Select id="ws-pkg" value="" onChange={(e) => { choosePackage(e.target.value); e.currentTarget.value = '' }}>
                    <option value="">Choose existing product / package...</option>
                    {basePackages.length > 0 ? <optgroup label="Packages">{basePackages.map((p) => <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>)}</optgroup> : null}
                    {addOns.length > 0 ? <optgroup label="Add-ons">{addOns.map((p) => <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>)}</optgroup> : null}
                  </Select>
                </Field>
              ) : null}
              <Field label="Product / package name" htmlFor="ws-name">
                <TextInput id="ws-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Enter a product / package name" maxLength={200} />
              </Field>
              <Field label="Description" htmlFor="ws-desc" hint="One inclusion per line - shown on the invoice.">
                <Textarea id="ws-desc" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={6} maxLength={500} placeholder="What's included..." />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Quantity" htmlFor="ws-qty"><TextInput id="ws-qty" type="number" min={1} value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Number(e.target.value) || 1) }))} /></Field>
                <Field label="Unit price" htmlFor="ws-unit"><TextInput id="ws-unit" inputMode="decimal" value={draft.unitPrice} onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))} placeholder="0.00" /></Field>
                <Field label="Discount" htmlFor="ws-disc"><TextInput id="ws-disc" inputMode="decimal" value={draft.discount} onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))} placeholder="0.00" /></Field>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-muted">Amount <span className="tabular ml-1 font-semibold text-ink">{money(amountOf(draft))}</span></span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setItemOpen(false)}>Cancel</Button>
                  <Button type="button" size="sm" onClick={saveItem} loading={saving} disabled={!draft.name.trim()}>Save item</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit invoice details modal */}
      {detailsOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={() => setDetailsOpen(false)}>
          <div role="dialog" aria-modal="true" className="my-8 w-full max-w-md rounded-md border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-ink">Invoice details</h2>
              <button type="button" onClick={() => setDetailsOpen(false)} aria-label="Close" className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink">×</button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Invoice type" htmlFor="ws-type">
                <Select id="ws-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="BALANCE">Balance</option>
                  <option value="SUPPLEMENTARY">Supplementary</option>
                </Select>
              </Field>
              <Field label="Invoice number" htmlFor="ws-num" hint="Blank = auto (INV-...)."><TextInput id="ws-num" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto" maxLength={30} /></Field>
              <Field label="Issue date" htmlFor="ws-date"><TextInput id="ws-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></Field>
              <Field label="PO number (optional)" htmlFor="ws-po"><TextInput id="ws-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="-" maxLength={60} /></Field>
              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => setDetailsOpen(false)}>Cancel</Button>
                <Button type="button" size="sm" loading={saving} onClick={() => { setDetailsOpen(false); persist({ type, invoiceNumber, invoiceDate, poNumber }) }}>Save details</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-right text-ink ${valueClass}`}>{value}</dd>
    </div>
  )
}

function RecordPayment({ csrf, projectId, invoiceId, balanceLabel }: { csrf: string; projectId: string; invoiceId: string; balanceLabel: string }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(recordPaymentAction, IDLE)
  useEffect(() => { if (state.status === 'success') router.refresh() }, [state, router])
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="flex items-center justify-between text-sm text-ink-muted">Balance <span className="tabular font-semibold text-ink">{balanceLabel}</span></div>
      <Select name="paymentMethod" aria-label="Payment method" defaultValue="BANK_TRANSFER" className="h-9">
        <option value="BANK_TRANSFER">Bank transfer</option>
        <option value="CARD">Card</option>
        <option value="CASH">Cash</option>
        <option value="OTHER">Other</option>
      </Select>
      <TextInput name="amount" inputMode="decimal" placeholder="0.00" aria-label="Amount" />
      <TextInput name="reference" placeholder="Reference (optional)" aria-label="Reference" maxLength={140} />
      <Button type="submit" size="sm" loading={pending}>Record payment</Button>
    </form>
  )
}
