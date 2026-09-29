'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button, secondaryLinkLg } from '@/components/ui/Button'
import { MainAside } from '@/components/EditLayout'
import { Field, Select, TextInput, Textarea } from '@/components/ui/form'
import { estimateTotals, estimateDeposit, toCents, formatCents } from '@/lib/pricing-estimate'
import type { QuoteActionState } from '../actions'

type QuoteFormAction = (prev: QuoteActionState, formData: FormData) => Promise<QuoteActionState>
type QuotePackage = { id: string; name: string; price: string; details?: string | null; isAddOn?: boolean }

/**
 * Studio-Ninja-style staff quote builder (docs/31). The quote is assembled by staff from the catalogue:
 * choose packages, add optional add-ons, write a covering note, then Save and Send. The quote CONTENT
 * (details, introduction, packages, add-ons, deposit, notes) is unchanged - the form now shares the
 * New-invoice layout (`InvoiceEditor`): one full-width column with no wrapping card, label:input rows,
 * the line items, then a 12-column footer with the totals top-right and notes + actions beneath them.
 * Totals run through the sourced pricing mirror (`@/lib/pricing-estimate`); the server recomputes on save.
 */

type LineType = 'custom' | 'package' | 'addon'
type Line = { description: string; quantity: number; unitPrice: string; lineType: LineType; referenceId?: string | null; details?: string | null }

const IDLE: QuoteActionState = { status: 'idle' }

/** One horizontal label:input row (matches the New-invoice form): label left, field fills the rest. */
function FieldRow({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7em_minmax(0,1fr)] items-center gap-4">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
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
  initialLines: Line[]
  initialIntroduction: string
  initialPoNumber: string
  initialNotes: string
  initialDepositPercent: string
  initialReference: string
  initialIssueDate: string
  packages: QuotePackage[]
  clientName: string
  clientEmail: string
  saveAction: QuoteFormAction
  sendAction: QuoteFormAction
  sendLabel?: string
  /** When set (Edit Quote), the footer shows "Save quote" + a "Cancel" link (no inline Send). */
  cancelHref?: string
}) {
  const [lines, setLines] = useState<Line[]>(initialLines)
  const [depositPercent, setDepositPercent] = useState(initialDepositPercent || '30')
  const [sendOpen, setSendOpen] = useState(false)
  const [saveState, save, saving] = useActionState(saveAction, IDLE)
  const [sendState, send, sending] = useActionState(sendAction, IDLE)
  const saveFormRef = useRef<HTMLFormElement>(null)
  // "Send" auto-saves the current lines first (the send action reads the saved quote from the DB), then
  // opens the compose dialog — so a user who just added items no longer sees "this quote has no items".
  const pendingSendRef = useRef(false)

  // On success the send action REDIRECTS to the destination page with a `?sent=` param, which shows the
  // "Quote sent" toast there (SentToast). The toast can't live here: a successful send flips the quote out
  // of DRAFT, and the parent only renders this builder while it IS a draft, so this whole component
  // unmounts on the post-send re-render. Only a send ERROR returns here (shown inline in the dialog).

  // After the auto-save triggered by "Send" resolves: open the dialog on success, or drop the intent on
  // error (the save error — e.g. no lines — is shown inline). saveState is a fresh object per submit.
  useEffect(() => {
    if (!pendingSendRef.current) return
    if (saveState.status === 'success') {
      pendingSendRef.current = false
      setSendOpen(true)
    } else if (saveState.status === 'error') {
      pendingSendRef.current = false
    }
  }, [saveState])

  const startSend = () => {
    pendingSendRef.current = true
    saveFormRef.current?.requestSubmit()
  }

  const est = estimateTotals(lines.map((l) => ({ unitPriceCents: toCents(l.unitPrice), quantity: l.quantity || 0 })))
  const pct = Math.min(100, Math.max(0, Number.parseInt(depositPercent || '0', 10) || 0))
  const dep = estimateDeposit(est.totalCents, pct)

  // Catalogue split: regular packages vs add-on products, so each has its own "choose from the catalogue"
  // dropdown (add-ons no longer start as a blank manual row).
  const packageOptions = packages.filter((p) => !p.isAddOn)
  const addonOptions = packages.filter((p) => p.isAddOn)
  const addCatalogue = (id: string, lineType: 'package' | 'addon') => {
    const pkg = packages.find((p) => p.id === id)
    if (pkg) setLines((cur) => [...cur, { description: pkg.name, quantity: 1, unitPrice: pkg.price, lineType, referenceId: pkg.id, details: pkg.details ?? null }])
  }
  const addPackage = (id: string) => addCatalogue(id, 'package')
  const addAddon = (id: string) => addCatalogue(id, 'addon')
  const addRow = (lineType: LineType) => setLines((cur) => [...cur, { description: '', quantity: 1, unitPrice: '', lineType }])
  const update = (index: number, patch: Partial<Line>) => setLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const removeRow = (index: number) => setLines((cur) => cur.filter((_, i) => i !== index))

  const indexed = lines.map((l, i) => ({ l, i }))
  const packageRows = indexed.filter((r) => r.l.lineType === 'package')
  const addonRows = indexed.filter((r) => r.l.lineType === 'addon')
  const customRows = indexed.filter((r) => r.l.lineType === 'custom')

  return (
    <div className="mt-4 flex flex-col gap-5">
      <form ref={saveFormRef} action={save} className="border-t border-line pt-6">
        {saveState.status === 'error' ? <div className="mb-6"><Alert tone="danger" title={saveState.message} /></div> : null}
        {saveState.status === 'success' ? <div className="mb-6"><Alert tone="success" title={cancelHref ? 'Quote saved' : 'Draft saved'} /></div> : null}
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="depositPercent" value={depositPercent} />
        <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

        {/* One full-width column, mirroring the New-invoice form: details, then the line items, then the
            totals (right) with notes on the left and the Save / Send actions under the totals. */}
        <div className="flex flex-col gap-8">
          {/* Quote details — two-column label:input form, the same shape as the invoice. */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <FieldRow label="Quote ID" htmlFor="reference"><TextInput id="reference" name="reference" required defaultValue={initialReference} placeholder="e.g. Q-0005" /></FieldRow>
              <FieldRow label="Issue date" htmlFor="issueDate"><TextInput id="issueDate" name="issueDate" type="date" required defaultValue={initialIssueDate} /></FieldRow>
            </div>
            <div className="flex flex-col gap-4">
              <FieldRow label="PO number" htmlFor="poNumber"><TextInput id="poNumber" name="poNumber" defaultValue={initialPoNumber} placeholder="Optional" /></FieldRow>
              <FieldRow label="Valid until" htmlFor="validUntil"><TextInput id="validUntil" name="validUntil" type="date" defaultValue={validUntil} /></FieldRow>
            </div>
          </div>

          {/* Line items — packages, add-ons and any custom lines (the invoice's "Products & packages"). */}
          <section className="flex min-w-0 flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Packages</p>
                {packageOptions.length > 0 ? (
                  <Select aria-label="Add a package" value="" onChange={(e) => { addPackage(e.target.value); e.currentTarget.value = '' }} className="h-8 max-w-xs">
                    <option value="" disabled>Add a package...</option>
                    {packageOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} - {formatCents(toCents(p.price))}</option>
                    ))}
                  </Select>
                ) : null}
              </div>
              <div className="mt-2">
                {packageRows.length === 0 ? <EmptyLines /> : (
                  <div className="flex flex-col">
                    {packageRows.map(({ l, i }) => (
                      <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Package" />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Add-ons</p>
                {addonOptions.length > 0 ? (
                  <Select aria-label="Add an add-on" value="" onChange={(e) => { addAddon(e.target.value); e.currentTarget.value = '' }} className="h-8 max-w-xs">
                    <option value="" disabled>Add an add-on...</option>
                    {addonOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} - {formatCents(toCents(p.price))}</option>
                    ))}
                  </Select>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => addRow('addon')}>+ Add add-on</Button>
                )}
              </div>
              <div className="mt-2">
                {addonRows.length === 0 ? <EmptyLines /> : (
                  <div className="flex flex-col">
                    {addonRows.map(({ l, i }) => (
                      <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Add-on" />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {customRows.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-ink">Other lines</p>
                <div className="mt-2 flex flex-col">
                  {customRows.map(({ l, i }) => (
                    <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Item" />
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => addRow('custom')}>+ Add a custom line</Button>
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

/**
 * Compose-and-send dialog. Pre-fills the recipient (client email) and a Moments-branded covering note
 * with the client's name already filled in; both the subject and message stay fully editable. The
 * server appends the "View Quotation" link and sends it (when an email provider is configured).
 */
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
  return <p className="rounded-md border border-dashed border-muted bg-paper px-4 py-5 text-center text-sm text-ink-muted">Nothing added yet.</p>
}

/**
 * One quote line as a structured line item (not a bordered card). Every row shares ONE content-aware
 * grid: name flexes to the widest track, quantity is compact, price is constrained, the remove action is
 * fixed - so package/add-on rows always line up. Rows are separated by a hairline, not nested cards.
 */
function LineRow({ line, onChange, onRemove, nameLabel }: { line: Line; onChange: (patch: Partial<Line>) => void; onRemove: () => void; nameLabel: string }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5em_7em_2.5em] sm:items-center">
        <TextInput aria-label={nameLabel} placeholder={nameLabel} value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
        <TextInput aria-label="Quantity" inputMode="numeric" className="sm:text-right" value={String(line.quantity)} onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })} />
        <TextInput aria-label="Unit price" inputMode="decimal" placeholder="0.00" className="sm:text-right" value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove line"
          className="flex h-10 w-10 items-center justify-center justify-self-end rounded text-ink-muted transition-colors hover:bg-sunk hover:text-danger"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
        </button>
      </div>
      {/* What's included - editable (prefilled from the package), shown on the client quote. Kept compact
          and secondary so a package reads as a line of structured content, not a stack of tall boxes. */}
      <Textarea
        aria-label="What's included"
        placeholder="What's included (one per line) - shown on the client's quote"
        rows={2}
        value={line.details ?? ''}
        onChange={(e) => onChange({ details: e.target.value })}
        className="mt-2 text-sm"
      />
    </div>
  )
}
