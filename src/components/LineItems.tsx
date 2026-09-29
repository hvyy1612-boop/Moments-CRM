'use client'

import { useRef, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea, TextInput } from '@/components/ui/form'

/**
 * Shared line-item editor used by the invoice and quote builders so their "add a product / package"
 * experience is identical: an Add-item modal (catalogue picker + name + description + qty + unit price
 * + %/$ discount) and a table row with edit / duplicate / remove / drag-reorder.
 *
 * The canonical LineItem is name + description (the invoice stores name as `itemName`; the quote stores
 * the name in its `description` column and the description in `details` - each parent maps at its edges).
 * `discount` is always a resolved DOLLAR amount off; the modal converts %/$ before it reaches state.
 */
export type LineItem = {
  id: number
  name: string
  description: string
  quantity: number
  unitPrice: string
  discount: string
  lineType?: 'package' | 'addon' | 'custom'
  referenceId?: string | null
}

export type ItemDraft = {
  name: string
  description: string
  quantity: number
  unitPrice: string
  discount: string
  discountMode: 'percent' | 'fixed'
}

export const EMPTY_DRAFT: ItemDraft = { name: '', description: '', quantity: 1, unitPrice: '', discount: '', discountMode: 'percent' }

/** A catalogue entry the modal can pick from; `group` becomes an <optgroup> label when present. */
export type CatalogueItem = { id: string; name: string; price: string; group?: string; detail?: string | null }

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
export function money(n: number): string {
  return aud.format(Number.isFinite(n) ? n : 0)
}
export function amountOf(l: { unitPrice: string; quantity: number; discount: string }): number {
  return Math.max((Number(l.unitPrice) || 0) * l.quantity - (Number(l.discount) || 0), 0)
}
/** The dollar amount a draft's discount takes off (percent of gross, or a fixed $), clamped to [0, gross]. */
export function draftDiscountOff(d: ItemDraft): number {
  const g = (Number(d.unitPrice) || 0) * d.quantity
  const v = Number(d.discount) || 0
  const off = d.discountMode === 'percent' ? (g * v) / 100 : v
  return Math.min(Math.max(Math.round(off * 100) / 100, 0), g)
}
export function draftAmount(d: ItemDraft): number {
  return Math.max((Number(d.unitPrice) || 0) * d.quantity - draftDiscountOff(d), 0)
}

function DragDots() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
  )
}

/** The invoice-style line table for a set of items. Drag-reorder is by id, so it works on a grouped subset. */
export function LineItemsTable({
  lines,
  onEdit,
  onDuplicate,
  onRemove,
  onReorder,
}: {
  lines: LineItem[]
  onEdit: (l: LineItem) => void
  onDuplicate: (id: number) => void
  onRemove: (id: number) => void
  onReorder: (draggedId: number, targetId: number) => void
}) {
  const dragId = useRef<number | null>(null)
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-muted">
      {/* Fixed layout + a shared colgroup so every instance of this table (e.g. Packages and Add-ons on
          the quote) uses the SAME column widths and lines up column-for-column. Description takes the
          remaining width; the numeric + actions columns are compact and identical across instances. */}
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-56" />
          <col />
          <col className="w-28" />
          <col className="w-16" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-24" />
        </colgroup>
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
          {lines.map((l) => (
            <tr
              key={l.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId.current !== null) onReorder(dragId.current, l.id); dragId.current = null }}
              className="border-b border-line align-top last:border-b-0"
            >
              <td className="px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span
                    draggable
                    onDragStart={() => { dragId.current = l.id }}
                    aria-label="Drag to reorder"
                    className="mt-0.5 shrink-0 cursor-grab text-muted hover:text-ink"
                  >
                    <DragDots />
                  </span>
                  <span className="min-w-0 break-words font-medium text-ink">{l.name || <span className="text-ink-muted">Untitled item</span>}</span>
                </div>
              </td>
              <td className="whitespace-pre-line break-words px-3 py-2 text-ink-muted">{l.description || '-'}</td>
              <td className="tabular px-3 py-2 text-right text-ink-muted">{money(Number(l.unitPrice) || 0)}</td>
              <td className="tabular px-3 py-2 text-center text-ink-muted">{l.quantity}</td>
              <td className="tabular px-3 py-2 text-right text-ink-muted">{Number(l.discount) > 0 ? `-${money(Number(l.discount))}` : '-'}</td>
              <td className="tabular px-3 py-2 text-right font-medium text-ink">{money(amountOf(l))}</td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button type="button" onClick={() => onEdit(l)} aria-label="Edit item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
                  </button>
                  <button type="button" onClick={() => onDuplicate(l.id)} aria-label="Duplicate item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                  </button>
                  <button type="button" onClick={() => onRemove(l.id)} aria-label="Remove item" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-danger">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The Add / Edit item modal. `catalogue` is already filtered by the caller; empty hides the picker. */
export function AddItemModal({
  open,
  editing,
  noun,
  catalogue,
  draft,
  setDraft,
  onChoose,
  onSave,
  onClose,
}: {
  open: boolean
  editing: boolean
  /** The document noun for the copy, e.g. "invoice" or "quote". */
  noun: string
  catalogue: CatalogueItem[]
  draft: ItemDraft
  setDraft: Dispatch<SetStateAction<ItemDraft>>
  onChoose: (id: string) => void
  onSave: () => void
  onClose: () => void
}) {
  if (!open) return null
  const groups = Array.from(new Set(catalogue.map((c) => c.group).filter(Boolean))) as string[]
  const off = draftDiscountOff(draft)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit item' : 'Add item'}
        className="my-8 w-full max-w-xl rounded-md border border-line bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink">{editing ? 'Edit item' : 'Add item'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 py-1 text-lg text-ink-muted hover:text-ink">×</button>
        </div>
        <p className="mb-4 text-sm text-ink-muted">Add a product or package to your {noun}.</p>

        <div className="flex flex-col gap-3">
          {catalogue.length > 0 ? (
            <Field label="Choose existing product / package" htmlFor="modal-pkg" hint="Fills the name, description and price - you can still edit them.">
              <Select id="modal-pkg" value="" onChange={(e) => { onChoose(e.target.value); e.currentTarget.value = '' }}>
                <option value="">Choose existing product / package...</option>
                {groups.length > 0
                  ? groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {catalogue.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name} - {money(Number(c.price))}</option>)}
                      </optgroup>
                    ))
                  : catalogue.map((c) => <option key={c.id} value={c.id}>{c.name} - {money(Number(c.price))}</option>)}
              </Select>
            </Field>
          ) : null}

          <Field label="Product / package name" htmlFor="modal-name">
            <TextInput id="modal-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Enter a product / package name" maxLength={200} />
          </Field>

          <Field label="Description" htmlFor="modal-desc" hint={`One inclusion per line - shown on the ${noun}.`}>
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
              <div className="flex items-stretch gap-1">
                <TextInput id="modal-disc" inputMode="decimal" value={draft.discount} onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))} placeholder="0" className="min-w-0 flex-1" />
                <div className="inline-flex shrink-0 items-center rounded-md border border-line p-0.5">
                  <button type="button" aria-label="Percent discount" onClick={() => setDraft((d) => ({ ...d, discountMode: 'percent' }))} className={`rounded px-2 py-1 text-sm ${draft.discountMode === 'percent' ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>%</button>
                  <button type="button" aria-label="Fixed amount discount" onClick={() => setDraft((d) => ({ ...d, discountMode: 'fixed' }))} className={`rounded px-2 py-1 text-sm ${draft.discountMode === 'fixed' ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>$</button>
                </div>
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm text-ink-muted">Amount <span className="tabular ml-1 font-semibold text-ink">{money(draftAmount(draft))}</span>{off > 0 ? <span className="ml-1 text-xs text-lost-ink">(-{money(off)})</span> : null}</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="button" size="sm" onClick={onSave} disabled={!draft.name.trim()}>Save item</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
