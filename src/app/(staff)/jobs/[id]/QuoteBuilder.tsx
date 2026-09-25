'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, FieldGrid, FormSection, Select, TextInput, Textarea } from '@/components/ui/form'
import { estimateTotals, estimateDeposit, toCents, formatCents } from '@/lib/pricing-estimate'
import type { QuoteActionState } from '../actions'

type QuoteFormAction = (prev: QuoteActionState, formData: FormData) => Promise<QuoteActionState>
type QuotePackage = { id: string; name: string; price: string; details?: string | null }

/**
 * Studio-Ninja-style staff quote builder (docs/31). The quote is assembled by staff from the catalogue:
 * choose packages, add optional add-ons, write a covering note, then Save and Send. Grouped into sections
 * (Introduction, Packages, Add-ons, Notes) that mirror the client-facing quote it produces. Totals run
 * through the sourced pricing mirror (`@/lib/pricing-estimate`); the server recomputes on save.
 */

type LineType = 'custom' | 'package' | 'addon'
type Line = { description: string; quantity: number; unitPrice: string; lineType: LineType; referenceId?: string | null; details?: string | null }

const IDLE: QuoteActionState = { status: 'idle' }

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

  // Close the Send dialog once the quote has gone out.
  useEffect(() => {
    if (sendState.status === 'success') setSendOpen(false)
  }, [sendState.status])

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

  const addPackage = (id: string) => {
    const pkg = packages.find((p) => p.id === id)
    if (pkg) setLines((cur) => [...cur, { description: pkg.name, quantity: 1, unitPrice: pkg.price, lineType: 'package', referenceId: pkg.id, details: pkg.details ?? null }])
  }
  const addRow = (lineType: LineType) => setLines((cur) => [...cur, { description: '', quantity: 1, unitPrice: '', lineType }])
  const update = (index: number, patch: Partial<Line>) => setLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const removeRow = (index: number) => setLines((cur) => cur.filter((_, i) => i !== index))

  const indexed = lines.map((l, i) => ({ l, i }))
  const packageRows = indexed.filter((r) => r.l.lineType === 'package')
  const addonRows = indexed.filter((r) => r.l.lineType === 'addon')
  const customRows = indexed.filter((r) => r.l.lineType === 'custom')

  return (
    <div className="mt-4 flex flex-col gap-5">
      {saveState.status === 'error' ? <Alert tone="danger" title={saveState.message} /> : null}
      {saveState.status === 'success' ? <Alert tone="success" title="Draft saved" /> : null}
      {sendState.status === 'success' ? <Alert tone="success" title="Quote sent to the client." /> : null}

      <form ref={saveFormRef} action={save} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20em] lg:items-start">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="depositPercent" value={depositPercent} />
        <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

        {/* Main editing column: the quote is assembled here. */}
        <div className="flex min-w-0 flex-col gap-8">
          <FormSection title="Quote details" description="Reference and dates shown on the client's quote.">
            <FieldGrid>
              <Field label="Quote ID *" htmlFor="reference" hint="Required. Shown to the client.">
                <TextInput id="reference" name="reference" required defaultValue={initialReference} placeholder="e.g. Q-0005" />
              </Field>
              <Field label="Issue date *" htmlFor="issueDate" hint="Required. The date the quote is issued.">
                <TextInput id="issueDate" name="issueDate" type="date" required defaultValue={initialIssueDate} />
              </Field>
              <Field label="PO number (optional)" htmlFor="poNumber" hint="The client's reference, if they use one.">
                <TextInput id="poNumber" name="poNumber" defaultValue={initialPoNumber} placeholder="e.g. PO-2026-014" />
              </Field>
              <Field label="Valid until" htmlFor="validUntil" hint="Optional. The quote expires after this date.">
                <TextInput id="validUntil" name="validUntil" type="date" defaultValue={validUntil} />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection title="Introduction" description="A short covering note shown at the top of the quote.">
            <Textarea id="introduction" name="introduction" rows={3} defaultValue={initialIntroduction} placeholder="Thank you for considering Moments. Here is the quote for your shoot..." />
          </FormSection>

          <FormSection
            title="Packages"
            description="Fixed-price packages from your catalogue."
            control={
              packages.length > 0 ? (
                <Select aria-label="Add a package" value="" onChange={(e) => { addPackage(e.target.value); e.currentTarget.value = '' }} className="max-w-xs">
                  <option value="" disabled>Add a package...</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} - {formatCents(toCents(p.price))}</option>
                  ))}
                </Select>
              ) : null
            }
          >
            {packageRows.length === 0 ? <EmptyLines /> : (
              <div className="flex flex-col">
                {packageRows.map(({ l, i }) => (
                  <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Package" />
                ))}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Add-ons"
            description="Optional extras - albums, prints, extra hours."
            control={<Button type="button" variant="secondary" size="sm" onClick={() => addRow('addon')}>+ Add add-on</Button>}
          >
            {addonRows.length === 0 ? <EmptyLines /> : (
              <div className="flex flex-col">
                {addonRows.map(({ l, i }) => (
                  <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Add-on" />
                ))}
              </div>
            )}
          </FormSection>

          {customRows.length > 0 ? (
            <FormSection title="Other lines" description="Free-typed lines.">
              <div className="flex flex-col">
                {customRows.map(({ l, i }) => (
                  <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Item" />
                ))}
              </div>
            </FormSection>
          ) : null}
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => addRow('custom')}>+ Add a custom line</Button>
          </div>

          <FormSection title="Notes" description="Any extra notes for the client (optional).">
            <Textarea id="notes" name="notes" rows={2} defaultValue={initialNotes} />
          </FormSection>
        </div>

        {/* Summary column: sticky totals + the primary save action. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <div className="rounded-md border border-line bg-paper p-4 text-sm">
            <Row label="Subtotal (excl. GST)" value={formatCents(est.exGstCents)} muted />
            <Row label="GST (incl., ÷ 11)" value={formatCents(est.gstCents)} muted />
            <div className="my-1 border-t border-line" />
            <Row label="Total (incl. GST)" value={formatCents(est.totalCents)} strong />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink">Deposit
                <span className="inline-flex items-center gap-1">
                  <TextInput value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} inputMode="numeric" className="w-14" aria-label="Deposit percent" />%
                </span>
              </span>
              <span className="tabular-nums font-medium text-ink">{formatCents(dep.depositCents)}</span>
            </div>
            <Row label="Balance due later" value={formatCents(dep.balanceCents)} muted />
          </div>
          <Button type="submit" loading={saving} className="w-full">Save draft</Button>
          <p className="text-xs text-ink-muted">Prices include GST. Totals are recalculated when you save.</p>
        </aside>
      </form>

      <div className="border-t border-line pt-4">
        <p className="text-sm text-ink-muted">Sending saves your latest changes first, then opens the email to the client.</p>
        <Button type="button" className="mt-3" loading={saving && pendingSendRef.current} onClick={startSend}>{sendLabel}</Button>
      </div>

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
 * server appends the "View your quote" button/link and sends it (when an email provider is configured).
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
  const defaultSubject = 'Your quotation from Moments Photography and Film'
  const defaultMessage =
    `Dear ${clientName},\n\n` +
    `Thank you for considering Moments Photography and Film.\n\n` +
    `Please find your quotation enclosed. You are welcome to review the full details and confirm your booking online using the button below.\n\n` +
    `Should you have any questions or wish to discuss anything further, please do not hesitate to contact us.\n\n` +
    `We look forward to the opportunity of working with you.\n\n` +
    `Kind regards,\nMoments Photography and Film`

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
          <Field label="Message" htmlFor="sq-message" hint="The client's name is filled in for you; a 'View your quote' button is added automatically.">
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
  return <p className="rounded-md border border-dashed border-line bg-paper px-4 py-5 text-center text-sm text-ink-muted">Nothing added yet.</p>
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

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className={muted ? 'text-ink-muted' : 'text-ink'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-ink' : muted ? 'text-ink-muted' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
