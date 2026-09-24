'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput, Textarea } from '@/components/ui/form'
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
  packages,
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
  packages: QuotePackage[]
  saveAction: QuoteFormAction
  sendAction: QuoteFormAction
  sendLabel?: string
}) {
  const [lines, setLines] = useState<Line[]>(initialLines)
  const [depositPercent, setDepositPercent] = useState(initialDepositPercent || '30')
  const [saveState, save, saving] = useActionState(saveAction, IDLE)
  const [sendState, send, sending] = useActionState(sendAction, IDLE)

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
      {sendState.status === 'error' ? <Alert tone="danger" title={sendState.message} /> : null}

      <form action={save} className="flex flex-col gap-5">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="depositPercent" value={depositPercent} />
        <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="PO number (optional)" htmlFor="poNumber" hint="The client's reference, if they use one.">
            <TextInput id="poNumber" name="poNumber" defaultValue={initialPoNumber} placeholder="e.g. PO-2026-014" />
          </Field>
          <Field label="Valid until" htmlFor="validUntil" hint="Optional. The quote expires after this date.">
            <TextInput id="validUntil" name="validUntil" type="date" defaultValue={validUntil} />
          </Field>
        </div>

        <Field label="Introduction" htmlFor="introduction" hint="A short covering note shown at the top of the quote.">
          <Textarea id="introduction" name="introduction" rows={3} defaultValue={initialIntroduction} placeholder="Thank you for considering Moments. Here is the quote for your shoot..." />
        </Field>

        <Section
          title="Packages"
          subtitle="Fixed-price packages from your catalogue."
          onEmpty={packageRows.length === 0}
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
          {packageRows.map(({ l, i }) => (
            <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Package" />
          ))}
        </Section>

        <Section
          title="Add-ons"
          subtitle="Optional extras - albums, prints, extra hours."
          onEmpty={addonRows.length === 0}
          control={<Button type="button" variant="secondary" size="sm" onClick={() => addRow('addon')}>+ Add add-on</Button>}
        >
          {addonRows.map(({ l, i }) => (
            <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Add-on" />
          ))}
        </Section>

        {customRows.length > 0 ? (
          <Section title="Other lines" subtitle="Free-typed lines." onEmpty={false} control={null}>
            {customRows.map(({ l, i }) => (
              <LineRow key={i} line={l} onChange={(patch) => update(i, patch)} onRemove={() => removeRow(i)} nameLabel="Item" />
            ))}
          </Section>
        ) : null}
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => addRow('custom')}>+ Add a custom line</Button>
        </div>

        {/* Totals - the sourced pricing arithmetic on the assembled lines. */}
        <div className="ml-auto w-full max-w-sm rounded-md border border-line bg-paper p-4 text-sm">
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

        <Field label="Notes (optional)" htmlFor="notes" hint="Any extra notes for the client.">
          <Textarea id="notes" name="notes" rows={2} defaultValue={initialNotes} />
        </Field>

        <p className="text-sm text-ink-muted">Prices include GST. Totals are recalculated when you save.</p>
        <div><Button type="submit" loading={saving}>Save draft</Button></div>
      </form>

      <form action={send} className="border-t border-line pt-4">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="projectId" value={projectId} />
        <p className="text-sm text-ink-muted">Save the draft first, then send the quote to the client.</p>
        <Button type="submit" loading={sending} className="mt-3">{sendLabel}</Button>
      </form>
    </div>
  )
}

function Section({ title, subtitle, control, onEmpty, children }: { title: string; subtitle: string; control: ReactNode; onEmpty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {control}
      </div>
      {onEmpty ? (
        <p className="rounded-md border border-dashed border-line bg-paper px-4 py-5 text-center text-sm text-ink-muted">Nothing added yet.</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  )
}

function LineRow({ line, onChange, onRemove, nameLabel }: { line: Line; onChange: (patch: Partial<Line>) => void; onRemove: () => void; nameLabel: string }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
      <div className="sm:col-span-7">
        <TextInput aria-label={nameLabel} placeholder={nameLabel} value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <TextInput aria-label="Quantity" inputMode="numeric" value={String(line.quantity)} onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })} />
      </div>
      <div className="sm:col-span-2">
        <TextInput aria-label="Unit price" inputMode="decimal" placeholder="0.00" value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
      </div>
      <div className="sm:col-span-1">
        <Button type="button" variant="secondary" size="sm" onClick={onRemove} aria-label="Remove line">Remove</Button>
      </div>
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
