'use client'

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Select, Textarea, TextInput } from '@/components/ui/form'
import { recordPaymentAction, saveInvoiceContentAction, saveReusableItemAction, type QuoteActionState } from '../../jobs/actions'
import { centsToAmount, computeAmountsCents, isFullyAllocated, sumPercents, toCents } from '@/lib/finance/instalments'
import { RefundButton } from './RefundButton'

const IDLE: QuoteActionState = { status: 'idle' }

export type WPackage = { id: string; name: string; price: string; description: string | null; inclusions: string | null; isAddOn: boolean }
export type WLine = { name: string; description: string; quantity: number; unitPrice: string; discount: string }
export type WJob = { id: string; name: string; subtype: string | null; shootLabel: string | null; location: string | null }
export type WClient = { name: string; email: string | null; phone: string | null; address: string | null }
export type WPaymentRow = { id: string; dateLabel: string; amountLabel: string; refundedLabel: string | null; method: string; reference: string | null; statusLabel: string; refundable: string; canRefund: boolean }

type Line = WLine & { id: number }
type Draft = { name: string; description: string; quantity: number; unitPrice: string; discount: string; discountMode: 'percent' | 'fixed' }
type SchedRow = { id: number; label: string; percent: string; dueAt: string }
const EMPTY_DRAFT: Draft = { name: '', description: '', quantity: 1, unitPrice: '', discount: '', discountMode: 'percent' }

const PRESETS: { key: string; label: string; percents: number[] }[] = [
  { key: 'full', label: 'Full payment', percents: [] },
  { key: '2575', label: '25% + 75%', percents: [25, 75] },
  { key: '5050', label: '50% + 50%', percents: [50, 50] },
  { key: '303040', label: '30% + 30% + 40%', percents: [30, 30, 40] },
]

function shiftDate(ymd: string, days: number): string {
  if (!ymd) return ''
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

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
  initial: { type: string; invoiceNumber: string; invoiceDate: string; poNumber: string; notes: string; discount: string; discountReason: string; lines: WLine[]; instalments: { label: string; dueAt: string; amount: string }[] }
  shootDate?: string | null
  job: WJob
  client: WClient
  packages: WPackage[]
  paymentRows: WPaymentRow[]
}) {
  const { csrf, invoiceId, projectId, editable, canPay, amountPaid, initial, shootDate, job, client, packages, paymentRows } = props
  const router = useRouter()

  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l, i) => ({ id: i + 1, ...l })))
  const [nextId, setNextId] = useState(initial.lines.length + 1)
  const [discount, setDiscount] = useState(initial.discount)
  const [discountReason, setDiscountReason] = useState(initial.discountReason)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discType, setDiscType] = useState<'percent' | 'fixed'>('fixed')
  const [discValue, setDiscValue] = useState('')
  const [discName, setDiscName] = useState('')
  const [type, setType] = useState(initial.type)
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber)
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate)
  const [poNumber, setPoNumber] = useState(initial.poNumber)
  const [notes] = useState(initial.notes)
  const [schedule, setSchedule] = useState<SchedRow[]>(() => {
    if (initial.instalments.length === 0) return []
    const g = initial.lines.reduce((s, l) => s + amountOf(l), 0)
    const d = Math.min(Number(initial.discount) || 0, g)
    const totalC = Math.round((g - d) * 100)
    const rows: SchedRow[] = initial.instalments.map((it, i) => ({ id: i + 1, label: it.label || `Payment ${i + 1}`, percent: '0', dueAt: it.dueAt }))
    if (totalC > 0) {
      let acc = 0
      for (let i = 0; i < rows.length; i++) {
        if (i === rows.length - 1) rows[i]!.percent = String(Math.round((100 - acc) * 100) / 100)
        else { const p = Math.round((toCents(initial.instalments[i]!.amount) / totalC) * 10000) / 100; rows[i]!.percent = String(p); acc += p }
      }
    }
    return rows
  })
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [nextSchedId, setNextSchedId] = useState(initial.instalments.length + 1)
  const scheduleDragIndex = useRef<number | null>(null)
  const schedBackup = useRef<SchedRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const [addMenu, setAddMenu] = useState(false)
  const addWrap = useRef<HTMLDivElement>(null)
  const [itemOpen, setItemOpen] = useState(false)
  const [itemEditId, setItemEditId] = useState<number | null>(null)
  const [withPackages, setWithPackages] = useState(true)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saveReuse, setSaveReuse] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const dragIndex = useRef<number | null>(null)
  const basePackages = packages.filter((p) => !p.isAddOn)
  const addOns = packages.filter((p) => p.isAddOn)

  const gross = lines.reduce((s, l) => s + amountOf(l), 0)
  const disc = Math.min(Number(discount) || 0, gross)
  const total = Math.max(gross - disc, 0)
  const gst = total / 11
  const subtotal = total - gst
  const balance = Math.max(total - amountPaid, 0)

  function scheduleToInstalments(sched: SchedRow[], totalCents: number) {
    if (sched.length === 0) return [] as { label: string; dueAt: string; amount: string }[]
    const amts = computeAmountsCents(totalCents, sched.map((r) => Number(r.percent) || 0))
    return sched.map((r, i) => ({ label: r.label || `Payment ${i + 1}`, dueAt: r.dueAt, amount: centsToAmount(amts[i] ?? 0) }))
  }

  function persist(next: Partial<{ lines: Line[]; discount: string; discountReason: string; type: string; invoiceNumber: string; invoiceDate: string; poNumber: string; schedule: SchedRow[] }>) {
    const nLines = next.lines ?? lines
    const nDiscount = next.discount ?? discount
    const nSched = next.schedule ?? schedule
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
    fd.set('discountReason', nDisc > 0 ? (next.discountReason ?? discountReason) : '')
    fd.set('lines', JSON.stringify(nLines.map((l) => ({ itemName: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount || '' }))))
    fd.set('instalments', JSON.stringify(scheduleToInstalments(nSched, Math.round(nTotal * 100))))
    setError(null)
    startSave(async () => {
      const res = await saveInvoiceContentAction(IDLE, fd)
      if (res.status === 'error') setError(res.message)
      else router.refresh()
    })
  }

  function openAdd(pkg: boolean, note = false) { setItemEditId(null); setWithPackages(pkg); setSaveReuse(false); setDraft(note ? { ...EMPTY_DRAFT, unitPrice: '0' } : EMPTY_DRAFT); setItemOpen(true); setAddMenu(false) }
  function openEdit(l: Line) { setItemEditId(l.id); setWithPackages(true); setSaveReuse(false); setDraft({ name: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, discountMode: 'fixed' }); setItemOpen(true) }

  function draftDiscountOff(): number {
    const g = (Number(draft.unitPrice) || 0) * draft.quantity
    const v = Number(draft.discount) || 0
    const off = draft.discountMode === 'percent' ? (g * v) / 100 : v
    return Math.min(Math.max(Math.round(off * 100) / 100, 0), g)
  }
  const draftAmount = () => Math.max((Number(draft.unitPrice) || 0) * draft.quantity - draftDiscountOff(), 0)
  function addQuick(id: string) {
    const p = packages.find((x) => x.id === id); if (!p) return
    const nLines = [...lines, { id: nextId, name: p.name, description: [p.description, p.inclusions].filter(Boolean).join('\n'), quantity: 1, unitPrice: p.price, discount: '' }]
    setNextId((n) => n + 1); setLines(nLines); setAddMenu(false); persist({ lines: nLines })
  }
  function choosePackage(id: string) {
    const p = packages.find((x) => x.id === id); if (!p) return
    setDraft((d) => ({ ...d, name: p.name, description: [p.description, p.inclusions].filter(Boolean).join('\n'), unitPrice: p.price }))
  }
  function saveItem() {
    if (!draft.name.trim()) return
    const built = { name: draft.name, description: draft.description, quantity: draft.quantity, unitPrice: draft.unitPrice, discount: String(draftDiscountOff()) }
    const nLines = itemEditId === null
      ? [...lines, { id: nextId, ...built }]
      : lines.map((l) => (l.id === itemEditId ? { ...l, ...built } : l))
    if (itemEditId === null) setNextId((n) => n + 1)
    if (saveReuse && /^\d+(\.\d{1,2})?$/.test(draft.unitPrice.trim())) {
      const rfd = new FormData()
      rfd.set('csrf', csrf); rfd.set('name', draft.name); rfd.set('description', draft.description); rfd.set('unitPrice', draft.unitPrice)
      void saveReusableItemAction(rfd)
    }
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

  function applyPreset(percents: number[]) {
    const rows: SchedRow[] = percents.map((p, i) => ({
      id: nextSchedId + i,
      label: i === 0 ? 'Deposit' : i === percents.length - 1 ? 'Final payment' : `Payment ${i + 1}`,
      percent: String(p),
      dueAt: i === 0 ? invoiceDate : '',
    }))
    setNextSchedId((n) => n + percents.length)
    setSchedule(rows)
  }
  function addSched() {
    setSchedule((s) => [...s, { id: nextSchedId, label: `Payment ${s.length + 1}`, percent: '0', dueAt: '' }])
    setNextSchedId((n) => n + 1)
  }
  function updateSched(id: number, patch: Partial<SchedRow>) { setSchedule((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r))) }
  function removeSched(id: number) { setSchedule((s) => s.filter((r) => r.id !== id)) }
  function reorderSched(target: number) {
    const from = scheduleDragIndex.current; scheduleDragIndex.current = null
    if (from === null || from === target) return
    setSchedule((s) => { const c = [...s]; const [m] = c.splice(from, 1); if (m) c.splice(target, 0, m); return c })
  }
  function relativeDue(opt: string): string {
    switch (opt) {
      case 'invoice': return invoiceDate
      case 'd7': return shiftDate(invoiceDate, 7)
      case 'd14': return shiftDate(invoiceDate, 14)
      case 'd30': return shiftDate(invoiceDate, 30)
      case 'shoot': return shootDate ?? ''
      case 'shoot-7': return shootDate ? shiftDate(shootDate, -7) : ''
      case 'shoot-14': return shootDate ? shiftDate(shootDate, -14) : ''
      default: return ''
    }
  }

  function openDiscount() {
    setDiscType('fixed')
    setDiscValue(Number(discount) > 0 ? discount : '')
    setDiscName(discountReason)
    setAddMenu(false)
    setDiscountOpen(true)
  }

  function draftDiscountAmount(): number {
    const v = Number(discValue) || 0
    if (v <= 0) return 0
    const amt = discType === 'percent' ? (gross * v) / 100 : v
    return Math.min(Math.round(amt * 100) / 100, gross)
  }
  function applyDiscount() {
    const amt = draftDiscountAmount()
    if (amt <= 0) return
    const reason = discName.trim() || (discType === 'percent' ? `${discValue}% discount` : 'Discount')
    setDiscount(String(amt)); setDiscountReason(reason); setDiscountOpen(false)
    persist({ discount: String(amt), discountReason: reason })
  }
  function removeDiscount() {
    setDiscount(''); setDiscountReason(''); setDiscountOpen(false)
    persist({ discount: '', discountReason: '' })
  }

  function openSchedule() { schedBackup.current = schedule; setEditingSchedule(true) }
  function cancelSchedule() { setSchedule(schedBackup.current); setEditingSchedule(false) }
  function saveSchedule() {
    if (!schedValid) return
    setEditingSchedule(false)
    persist({ schedule })
  }

  useEffect(() => {
    if (!addMenu) return
    function onDoc(e: MouseEvent) { if (addWrap.current && !addWrap.current.contains(e.target as Node)) setAddMenu(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [addMenu])
  useEffect(() => {
    if (!itemOpen && !detailsOpen && !editingSchedule && !discountOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setItemOpen(false); setDetailsOpen(false); setEditingSchedule(false); setDiscountOpen(false) } }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [itemOpen, detailsOpen, editingSchedule, discountOpen])

  const totalCents = Math.round(total * 100)
  const schedPercents = schedule.map((r) => Number(r.percent) || 0)
  const schedSum = sumPercents(schedPercents)
  const schedValid = schedule.length === 0 || isFullyAllocated(schedPercents)
  const schedAmounts = computeAmountsCents(totalCents, schedPercents)
  const todayYmd = new Date().toISOString().slice(0, 10)
  const readRows = schedule.length === 0
    ? [{ label: 'Full payment', percent: 100, dueAt: invoiceDate, amountC: totalCents }]
    : schedule.map((r, i) => ({ label: r.label || `Payment ${i + 1}`, percent: Number(r.percent) || 0, dueAt: r.dueAt, amountC: schedAmounts[i] ?? 0 }))
  let remCents = Math.round(amountPaid * 100)
  const scheduleView = readRows.map((r) => {
    const pay = Math.max(Math.min(remCents, r.amountC), 0); remCents -= pay
    const status = r.amountC > 0 && pay >= r.amountC ? 'Paid' : pay > 0 ? 'Partially paid' : r.dueAt && r.dueAt < todayYmd ? 'Overdue' : 'Upcoming'
    return { ...r, status }
  })

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
            <Row label="Due date" value={schedule.length > 0 ? 'Per schedule' : (invoiceDate || 'On issue')} />
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
                  <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
                    {packages.length > 0 ? (
                      <div className="border-b border-line pb-2">
                        <div className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">Quick add</div>
                        <div className="flex flex-wrap gap-1.5 px-3">
                          {packages.slice(0, 6).map((p) => (
                            <button key={p.id} type="button" onClick={() => addQuick(p.id)} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink hover:border-accent hover:text-accent-ink">{p.name}</button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">From catalogue</div>
                    <button type="button" onClick={() => openAdd(true)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Product or package</button>
                    <div className="mt-1 border-t border-line px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">One-off</div>
                    <button type="button" onClick={() => openAdd(false)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Custom charge</button>
                    <button type="button" onClick={() => openAdd(false, true)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Custom text / note</button>
                    <button type="button" onClick={openDiscount} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper">Discount</button>
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
        </div>

        <div className="w-full rounded-lg border border-line bg-surface p-4 text-sm lg:w-72 lg:shrink-0">
          <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular">{money(subtotal)}</span></div>
          <div className="flex justify-between py-0.5 text-ink-muted"><span>GST (10%)</span><span className="tabular">{money(gst)}</span></div>
          {disc > 0 ? (
            <div className="py-1">
              <div className="flex justify-between"><span className="text-ink-muted">Discount</span><span className="tabular text-danger">-{money(disc)}</span></div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-ink-muted">{discountReason || 'Invoice discount'}</span>
                {editable ? (
                  <span className="flex shrink-0 gap-2 text-xs">
                    <button type="button" onClick={openDiscount} className="font-semibold text-accent hover:underline">Edit</button>
                    <button type="button" onClick={removeDiscount} className="text-ink-muted hover:text-danger">Remove</button>
                  </span>
                ) : null}
              </div>
            </div>
          ) : editable ? (
            <div className="flex items-center justify-between py-0.5">
              <span className="text-ink-muted">Discount</span>
              <button type="button" onClick={openDiscount} className="text-xs font-semibold text-accent hover:underline">+ Add</button>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold text-ink"><span>Total due</span><span className="tabular">{money(total)}</span></div>
          <div className="mt-1 flex justify-between py-0.5 text-ink-muted"><span>Paid</span><span className="tabular text-delivered-ink">{money(amountPaid)}</span></div>
          <div className="flex justify-between py-0.5 font-semibold text-ink"><span>Balance</span><span className="tabular">{money(balance)}</span></div>
        </div>
      </div>

      {/* Bottom: Schedule | History | Record */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface">
          <CardHeader
            icon={<svg {...svg}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>}
            title="Payment schedule"
            action={editable ? <button type="button" onClick={openSchedule} className="text-xs font-semibold text-accent hover:underline">Edit schedule</button> : null}
          />
          <div className="p-4">
            <ul className="flex flex-col gap-2">
              {scheduleView.map((r, i) => (
                <li key={i} className="flex items-start justify-between gap-2 border-b border-line pb-2 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{String(i + 1).padStart(2, '0')} · {r.label}</div>
                    <div className="text-xs text-ink-muted">{r.percent}% · {r.dueAt || 'On issue'}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular text-ink">{money(r.amountC / 100)}</div>
                    <div className={`text-xs ${r.status === 'Paid' ? 'text-delivered-ink' : r.status === 'Overdue' ? 'text-danger' : 'text-ink-muted'}`}>{r.status}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between pt-1 text-sm font-semibold text-ink"><span>Total</span><span className="tabular">{money(total)}</span></div>
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
                <Field label="Discount" htmlFor="ws-disc">
                  <div className="flex items-stretch gap-1">
                    <TextInput id="ws-disc" inputMode="decimal" value={draft.discount} onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))} placeholder="0" className="min-w-0 flex-1" />
                    <div className="inline-flex shrink-0 items-center rounded-md border border-line p-0.5">
                      <button type="button" aria-label="Percent discount" onClick={() => setDraft((d) => ({ ...d, discountMode: 'percent' }))} className={`rounded px-2 py-1 text-sm ${draft.discountMode === 'percent' ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>%</button>
                      <button type="button" aria-label="Fixed amount discount" onClick={() => setDraft((d) => ({ ...d, discountMode: 'fixed' }))} className={`rounded px-2 py-1 text-sm ${draft.discountMode === 'fixed' ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>$</button>
                    </div>
                  </div>
                </Field>
              </div>
              <Checkbox label="Save this item to the catalogue for reuse" checked={saveReuse} onChange={(e) => setSaveReuse(e.target.checked)} />
              <p className="text-xs text-ink-muted">Changes apply to this invoice only - the original package is not changed.</p>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-muted">Amount <span className="tabular ml-1 font-semibold text-ink">{money(draftAmount())}</span>{draftDiscountOff() > 0 ? <span className="ml-1 text-xs text-danger">(-{money(draftDiscountOff())})</span> : null}</span>
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

      {/* Payment schedule builder modal */}
      {editingSchedule ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={cancelSchedule}>
          <div role="dialog" aria-modal="true" className="my-8 w-full max-w-2xl rounded-md border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-ink">Payment schedule</h2>
              <button type="button" onClick={cancelSchedule} aria-label="Close" className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink">×</button>
            </div>
            <p className="mb-4 text-sm text-ink-muted">Enter a percentage for each instalment - the amount is calculated from the invoice total ({money(total)}). Changes apply to this invoice only.</p>

            <div className="mb-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.key} type="button" variant="secondary" size="sm" onClick={() => applyPreset(p.percents)}>{p.label}</Button>
              ))}
            </div>

            {schedule.length === 0 ? (
              <p className="rounded border border-dashed border-line px-3 py-6 text-center text-sm text-ink-muted">Full payment on issue. Pick a preset above or add an instalment to split it.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {schedule.map((r, index) => (
                  <div key={r.id} onDragOver={(e) => e.preventDefault()} onDrop={() => reorderSched(index)} className="flex flex-wrap items-end gap-2 rounded-md border border-line p-2">
                    <span draggable onDragStart={() => { scheduleDragIndex.current = index }} aria-label="Drag to reorder" className="mb-2 shrink-0 cursor-grab text-muted hover:text-ink">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
                    </span>
                    <label className="flex min-w-40 flex-1 flex-col text-xs text-ink-muted">Payment
                      <TextInput value={r.label} onChange={(e) => updateSched(r.id, { label: e.target.value })} placeholder={`Payment ${index + 1}`} className="mt-1 h-9" />
                    </label>
                    <label className="flex w-20 flex-col text-xs text-ink-muted">%
                      <TextInput inputMode="decimal" value={r.percent} onChange={(e) => updateSched(r.id, { percent: e.target.value })} className="mt-1 h-9" />
                    </label>
                    <div className="flex w-24 flex-col text-xs text-ink-muted">Amount
                      <span className="tabular mt-1 flex h-9 items-center justify-end pr-1 font-medium text-ink">{money((schedAmounts[index] ?? 0) / 100)}</span>
                    </div>
                    <label className="flex flex-col text-xs text-ink-muted">Due date
                      <TextInput type="date" value={r.dueAt} onChange={(e) => updateSched(r.id, { dueAt: e.target.value })} className="mt-1 h-9" />
                    </label>
                    <Select aria-label="Quick due date" value="" onChange={(e) => { if (e.target.value) updateSched(r.id, { dueAt: relativeDue(e.target.value) }); e.currentTarget.value = '' }} className="h-9 w-40">
                      <option value="">Quick set...</option>
                      <option value="invoice">Invoice date</option>
                      <option value="d7">In 7 days</option>
                      <option value="d14">In 14 days</option>
                      <option value="d30">In 30 days</option>
                      {shootDate ? <option value="shoot">Main shoot date</option> : null}
                      {shootDate ? <option value="shoot-7">7 days before shoot</option> : null}
                      {shootDate ? <option value="shoot-14">14 days before shoot</option> : null}
                    </Select>
                    <button type="button" onClick={() => removeSched(r.id)} aria-label="Remove instalment" className="mb-1 rounded p-1 text-ink-muted hover:bg-paper hover:text-danger">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={addSched} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add instalment
            </button>

            {schedule.length > 0 ? (
              <div className="mt-4 rounded-md bg-paper p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Allocated <span className={`font-semibold ${schedValid ? 'text-delivered-ink' : 'text-danger'}`}>{schedSum}%</span> of 100%</span>
                  {schedValid
                    ? <span className="font-semibold text-delivered-ink">Fully allocated · {money(total)}</span>
                    : <span className="font-semibold text-danger">{schedSum < 100 ? `${Math.round((100 - schedSum) * 100) / 100}% still to allocate` : `${Math.round((schedSum - 100) * 100) / 100}% over`}</span>}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
              <Button type="button" variant="secondary" size="sm" onClick={cancelSchedule}>Cancel</Button>
              <Button type="button" size="sm" onClick={saveSchedule} disabled={!schedValid}>Save schedule</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Invoice-level discount drawer (right side) */}
      {discountOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={() => setDiscountOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Invoice discount" className="h-full w-full max-w-sm overflow-y-auto border-l border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-ink">Discount</h2>
              <button type="button" onClick={() => setDiscountOpen(false)} aria-label="Close" className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink">×</button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Apply to</div>
                <div className="mt-1 text-sm text-ink">Entire invoice</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Type</div>
                <div className="mt-1 inline-flex rounded-md border border-line p-0.5">
                  <button type="button" onClick={() => setDiscType('percent')} className={`rounded px-3 py-1 text-sm ${discType === 'percent' ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>Percentage</button>
                  <button type="button" onClick={() => setDiscType('fixed')} className={`rounded px-3 py-1 text-sm ${discType === 'fixed' ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>Fixed</button>
                </div>
              </div>

              <Field label="Name / reason (optional)" htmlFor="disc-name">
                <TextInput id="disc-name" value={discName} onChange={(e) => setDiscName(e.target.value)} placeholder="e.g. Wedding promotion" maxLength={100} />
              </Field>

              <Field label={discType === 'percent' ? 'Discount (%)' : 'Amount ($)'} htmlFor="disc-value">
                <TextInput id="disc-value" inputMode="decimal" value={discValue} onChange={(e) => setDiscValue(e.target.value)} placeholder={discType === 'percent' ? '10' : '0.00'} />
              </Field>

              <div className="rounded-md bg-paper p-3 text-sm">
                <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal</span><span className="tabular">{money(gross)}</span></div>
                <div className="flex justify-between py-0.5 text-ink-muted"><span>Discount</span><span className="tabular text-danger">-{money(draftDiscountAmount())}</span></div>
                <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>New total</span><span className="tabular">{money(Math.max(gross - draftDiscountAmount(), 0))}</span></div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                {Number(discount) > 0 ? <Button type="button" variant="secondary" size="sm" onClick={removeDiscount}>Remove</Button> : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => setDiscountOpen(false)}>Cancel</Button>
                <Button type="button" size="sm" onClick={applyDiscount} disabled={draftDiscountAmount() <= 0}>Apply discount</Button>
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
