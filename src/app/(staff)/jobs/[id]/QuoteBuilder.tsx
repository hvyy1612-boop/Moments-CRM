'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button, secondaryLinkLg } from '@/components/ui/Button'
import { MainAside } from '@/components/EditLayout'
import { Field, TextInput, Textarea } from '@/components/ui/form'
import { estimateTotals, estimateDeposit, toCents, formatCents } from '@/lib/pricing-estimate'
import { AddItemModal, LineItemsTable, EMPTY_DRAFT, draftDiscountOff, type CatalogueItem, type ItemDraft, type LineItem } from '@/components/LineItems'
import { useToast } from '@/components/ui/ToastProvider'
import type { QuoteActionState } from '../actions'

type QuoteFormAction = (prev: QuoteActionState, formData: FormData) => Promise<QuoteActionState>
type QuotePackage = { id: string; name: string; price: string; details?: string | null; isAddOn?: boolean }

type LineType = 'custom' | 'package' | 'addon'

type InitialLine = { description: string; quantity: number; unitPrice: string; lineType: LineType; referenceId?: string | null; details?: string | null; discount?: string }

const IDLE: QuoteActionState = { status: 'idle' }

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7em_minmax(0,1fr)] items-center gap-4">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7em_minmax(0,1fr)] items-center gap-4">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex min-h-10 min-w-0 items-center rounded-md border border-line bg-paper px-3 text-sm text-ink">
        <span className="truncate" title={value || undefined}>{value || '-'}</span>
      </div>
    </div>
  )
}

export function QuoteBuilder({
  csrf,
  projectId,
  quoteId,
  versionId,
  validUntil,
  initialLines,
  initialIntroduction,
  initialPoNumber,
  initialNotes,
  initialDepositPercent,
  initialReference,
  initialIssueDate,
  packages,
  clientName,
  clientEmail,
  clientPhone = '',
  jobName = '',
  saveAction,
  sendAction,
  sendLabel = 'Send to client',
  cancelHref,
}: {
  csrf: string
  projectId: string
  quoteId: string
  versionId: string
  validUntil: string
  initialLines: InitialLine[]
  initialIntroduction: string
  initialPoNumber: string
  initialNotes: string
  initialDepositPercent: string
  initialReference: string
  initialIssueDate: string
  packages: QuotePackage[]
  clientName: string
  clientEmail: string
  clientPhone?: string
  jobName?: string
  saveAction: QuoteFormAction
  sendAction: QuoteFormAction
  sendLabel?: string

  cancelHref?: string
}) {

  const [lines, setLines] = useState<LineItem[]>(() =>
    initialLines.map((l, i) => ({
      id: i + 1,
      name: l.description,
      description: l.details ?? '',
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount ?? '0',
      lineType: l.lineType,
      referenceId: l.referenceId ?? null,
    })),
  )
  const [nextId, setNextId] = useState(() => initialLines.length + 1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT)
  const [addType, setAddType] = useState<LineType>('package')
  const chosenRef = useRef<string | null>(null)
  const [depositPercent, setDepositPercent] = useState(initialDepositPercent || '30')
  const [sendOpen, setSendOpen] = useState(false)
  const [saveState, save, saving] = useActionState(saveAction, IDLE)
  const [sendState, send, sending] = useActionState(sendAction, IDLE)
  const saveFormRef = useRef<HTMLFormElement>(null)

  const pendingSendRef = useRef(false)
  const toast = useToast()

  useEffect(() => {
    if (saveState.status === 'success') {
      if (pendingSendRef.current) {

        pendingSendRef.current = false
        setSendOpen(true)
      } else {

        toast({ title: cancelHref ? 'Quote saved' : 'Draft saved' })
      }
    } else if (saveState.status === 'error') {
      pendingSendRef.current = false
    }
  }, [saveState, toast, cancelHref])

  const startSend = () => {
    pendingSendRef.current = true
    saveFormRef.current?.requestSubmit()
  }

  const est = estimateTotals(
    lines.map((l) => ({ unitPriceCents: toCents(l.unitPrice), quantity: l.quantity || 0, discountCents: toCents(l.discount || '0') })),
  )
  const pct = Math.min(100, Math.max(0, Number.parseInt(depositPercent || '0', 10) || 0))
  const dep = estimateDeposit(est.totalCents, pct)

  const packageOptions = packages.filter((p) => !p.isAddOn)
  const addonOptions = packages.filter((p) => p.isAddOn)
  const toCatalogue = (list: QuotePackage[], group: string): CatalogueItem[] =>
    list.map((p) => ({ id: p.id, name: p.name, price: p.price, group, detail: p.details ?? null }))
  const packageCatalogue = toCatalogue(packageOptions, 'Packages')
  const addonCatalogue = toCatalogue(addonOptions, 'Add-ons')
  const modalCatalogue = addType === 'package' ? packageCatalogue : addType === 'addon' ? addonCatalogue : []

  function openAdd(type: LineType) {
    setAddType(type)
    setEditId(null)
    setDraft(EMPTY_DRAFT)
    chosenRef.current = null
    setModalOpen(true)
  }
  function openEdit(l: LineItem) {
    setAddType(l.lineType ?? 'custom')
    setEditId(l.id)
    setDraft({ name: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, discountMode: 'fixed' })
    chosenRef.current = l.referenceId ?? null
    setModalOpen(true)
  }
  function choosePackage(id: string) {
    const cat = [...packageCatalogue, ...addonCatalogue].find((c) => c.id === id)
    if (!cat) return
    chosenRef.current = id
    setDraft((d) => ({ ...d, name: cat.name, description: cat.detail ?? '', unitPrice: cat.price }))
  }
  function saveItem() {
    if (!draft.name.trim()) return
    const base = {
      name: draft.name,
      description: draft.description,
      quantity: draft.quantity,
      unitPrice: draft.unitPrice,
      discount: String(draftDiscountOff(draft)),
      lineType: addType,
      referenceId: chosenRef.current,
    }
    if (editId === null) {
      setLines((ls) => [...ls, { id: nextId, ...base }])
      setNextId((n) => n + 1)
    } else {
      setLines((ls) => ls.map((l) => (l.id === editId ? { ...l, ...base } : l)))
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
  function removeLine(id: number) {
    setLines((ls) => ls.filter((l) => l.id !== id))
  }
  function reorder(draggedId: number, targetId: number) {
    setLines((ls) => {
      const copy = [...ls]
      const from = copy.findIndex((l) => l.id === draggedId)
      if (from < 0) return ls
      const [moved] = copy.splice(from, 1)
      const to = copy.findIndex((l) => l.id === targetId)
      copy.splice(to < 0 ? from : to, 0, moved!)
      return copy
    })
  }

  const packageLines = lines.filter((l) => (l.lineType ?? 'custom') === 'package')
  const addonLines = lines.filter((l) => (l.lineType ?? 'custom') === 'addon')
  const customLines = lines.filter((l) => (l.lineType ?? 'custom') === 'custom')

  return (
    <div className="mt-4 flex flex-col gap-5">
      <form ref={saveFormRef} action={save} className="border-t border-line pt-6">
        {saveState.status === 'error' ? <div className="mb-6"><Alert tone="danger" title={saveState.message} /></div> : null}
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="depositPercent" value={depositPercent} />
        {/* Edit-quote page (cancelHref set): return to the read-only detail after saving, like the
            invoice editor. The job-detail inline builder omits this and stays put. */}
        {cancelHref ? <input type="hidden" name="redirectToDetail" value="1" /> : null}
        <input
          type="hidden"
          name="linesJson"
          value={JSON.stringify(
            lines.map((l) => ({
              description: l.name,
              details: l.description || null,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              lineType: l.lineType ?? 'custom',
              referenceId: l.referenceId ?? null,
            })),
          )}
        />

        {/* One full-width column, mirroring the New-invoice form: details, then the line items, then the
            totals (right) with notes on the left and the Save / Send actions under the totals. */}
        <div className="flex flex-col gap-8">
          {/* Quote details — the same two-column shape as the invoice: editable quote fields on the
              left, read-only client/job info (from the linked enquiry/client) on the right. */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <FieldRow label="Quote ID" htmlFor="reference"><TextInput id="reference" name="reference" required defaultValue={initialReference} placeholder="e.g. Q-0005" /></FieldRow>
              <FieldRow label="PO number" htmlFor="poNumber"><TextInput id="poNumber" name="poNumber" defaultValue={initialPoNumber} placeholder="Optional" /></FieldRow>
              <FieldRow label="Issue date" htmlFor="issueDate"><TextInput id="issueDate" name="issueDate" type="date" required defaultValue={initialIssueDate} /></FieldRow>
              <FieldRow label="Valid until" htmlFor="validUntil"><TextInput id="validUntil" name="validUntil" type="date" defaultValue={validUntil} /></FieldRow>
            </div>
            <div className="flex flex-col gap-4">
              <ReadField label="Job name" value={jobName} />
              <ReadField label="Client name" value={clientName} />
              <ReadField label="Email" value={clientEmail} />
              <ReadField label="Phone" value={clientPhone} />
            </div>
          </div>

          {/* Line items — packages, add-ons and any custom lines. Each group adds via the shared
              invoice-style "Add item" modal and shows the shared line-items table. */}
          <section className="flex min-w-0 flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Packages</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => openAdd('package')}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Add a package
                </Button>
              </div>
              {packageLines.length === 0 ? <EmptyLines /> : (
                <LineItemsTable lines={packageLines} onEdit={openEdit} onDuplicate={duplicate} onRemove={removeLine} onReorder={reorder} />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Add-ons</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => openAdd('addon')}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Add an add-on
                </Button>
              </div>
              {addonLines.length === 0 ? <EmptyLines /> : (
                <LineItemsTable lines={addonLines} onEdit={openEdit} onDuplicate={duplicate} onRemove={removeLine} onReorder={reorder} />
              )}
            </div>

            {customLines.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-ink">Other lines</p>
                <LineItemsTable lines={customLines} onEdit={openEdit} onDuplicate={duplicate} onRemove={removeLine} onReorder={reorder} />
              </div>
            ) : null}
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => openAdd('custom')}>+ Add a custom line</Button>
            </div>
          </section>

          {/* Notes (main) + Financial summary (aside) sit in ONE row sharing a top keyline. */}
          <MainAside
            main={
              <div>
                <label htmlFor="notes" className="text-sm font-semibold text-ink">Notes (optional)</label>
                <Textarea id="notes" name="notes" rows={6} defaultValue={initialNotes} placeholder="Any extra notes for the client..." className="mt-2" />
              </div>
            }
            aside={
              <div className="text-sm">
                <div className="flex justify-between py-1 text-ink"><span>Subtotal (excl. GST)</span><span className="tabular-nums">{formatCents(est.exGstCents)}</span></div>
                <div className="flex justify-between py-1 text-ink"><span>GST (incl., ÷ 11)</span><span className="tabular-nums">{formatCents(est.gstCents)}</span></div>
                <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3 font-semibold text-ink">
                  <span className="text-lg">Total (incl. GST)</span>
                  <span className="tabular-nums text-xl">{formatCents(est.totalCents)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 py-0.5 text-ink">
                  <span className="flex items-center gap-2">Deposit
                    <span className="inline-flex items-center gap-1">
                      <TextInput value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} inputMode="numeric" className="h-8 w-14 text-right" aria-label="Deposit percent" />%
                    </span>
                  </span>
                  <span className="tabular-nums font-medium text-ink">{formatCents(dep.depositCents)}</span>
                </div>
                <div className="flex justify-between py-0.5 text-ink-muted"><span>Balance due later</span><span className="tabular-nums">{formatCents(dep.balanceCents)}</span></div>
              </div>
            }
          />

          {/* Action footer: its own full-width row (Carbon in-page - primary first, secondary after). */}
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-muted">
              {cancelHref
                ? 'Prices include GST and are recalculated when you save.'
                : 'Prices include GST and are recalculated when you save. Sending saves your latest changes first, then opens the email to the client.'}
            </p>
            {cancelHref ? (
              <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                <Button type="submit" size="lg" loading={saving} className="w-full rounded-lg">Save quote</Button>
                <Link href={cancelHref} className={`w-full ${secondaryLinkLg}`}>Cancel</Link>
              </div>
            ) : (
              <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                <Button type="button" size="lg" loading={saving && pendingSendRef.current} onClick={startSend} className="w-full rounded-lg">{sendLabel}</Button>
                <Button type="submit" variant="secondary" size="lg" loading={saving && !pendingSendRef.current} className="w-full rounded-lg">Save draft</Button>
              </div>
            )}
          </div>
        </div>
      </form>

      <AddItemModal
        open={modalOpen}
        editing={editId !== null}
        noun="quote"
        catalogue={modalCatalogue}
        draft={draft}
        setDraft={setDraft}
        onChoose={choosePackage}
        onSave={saveItem}
        onClose={() => setModalOpen(false)}
      />

      {sendOpen ? (
        <SendQuoteDialog
          csrf={csrf}
          quoteId={quoteId}
          projectId={projectId}
          clientName={clientName}
          clientEmail={clientEmail}
          sendLabel={sendLabel}
          send={send}
          sending={sending}
          error={sendState.status === 'error' ? sendState.message : null}
          onClose={() => setSendOpen(false)}
        />
      ) : null}
    </div>
  )
}

function SendQuoteDialog({
  csrf,
  quoteId,
  projectId,
  clientName,
  clientEmail,
  sendLabel,
  send,
  sending,
  error,
  onClose,
}: {
  csrf: string
  quoteId: string
  projectId: string
  clientName: string
  clientEmail: string
  sendLabel: string
  send: (payload: FormData) => void
  sending: boolean
  error: string | null
  onClose: () => void
}) {
  const defaultSubject = 'Your Quotation from Moments Photography & Film'
  const defaultMessage =
    `Dear ${clientName},\n\n` +
    `Thank you for considering Moments Photography & Film.\n\n` +
    `We are pleased to provide you with your quotation for the requested photography and film services. Please use the link below to review the quotation, including the selected services, pricing and relevant details.\n\n` +
    `Should you wish to proceed, you may confirm your quotation directly from the quotation page.\n\n` +
    `If you have any questions or would like to discuss any aspect of the quotation, please do not hesitate to contact us.\n\n` +
    `We look forward to the opportunity to work with you.\n\n` +
    `Kind regards,\n\nMoments Photography & Film`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Send quote">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg rounded-md border border-line bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">Send quote</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {error ? <div className="mb-3"><Alert tone="danger" title={error} /></div> : null}
        <form action={send} className="flex flex-col gap-4">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="quoteId" value={quoteId} />
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="To" htmlFor="sq-to" hint="The client's email address.">
            <TextInput id="sq-to" name="to" type="email" defaultValue={clientEmail} required placeholder="client@example.com" />
          </Field>
          <Field label="Subject" htmlFor="sq-subject">
            <TextInput id="sq-subject" name="subject" defaultValue={defaultSubject} />
          </Field>
          <Field label="Message" htmlFor="sq-message" hint="The client's name is filled in for you; a 'View Quotation' link is added automatically.">
            <Textarea id="sq-message" name="message" rows={9} defaultValue={defaultMessage} />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" loading={sending}>{sendLabel}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EmptyLines() {
  return <p className="mt-2 rounded-md border border-dashed border-muted bg-paper px-4 py-5 text-center text-sm text-ink-muted">Nothing added yet.</p>
}
