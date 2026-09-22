'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/form'
import { estimateTotals, estimateDeposit, toCents, formatCents } from '@/lib/pricing-estimate'

/**
 * Interactive Price calculator (brief: "packages, pricing calculations"). Staff pick fixed-price packages
 * from the catalogue (prices from the company website), adjust quantity / discount / deposit %, and see the
 * total, GST split and deposit update live. All arithmetic runs through `@/lib/pricing-estimate`, the
 * browser mirror of the sourced Decimal module (verified equal by test) — nothing is invented here.
 */

export type CatalogPackage = { id: string; name: string; price: string }
type Line = { key: string; name: string; unitPrice: string; quantity: string; discount: string }

export function PricingCalculator({ packages }: { packages: CatalogPackage[] }) {
  const [lines, setLines] = useState<Line[]>([])
  const [depositPercent, setDepositPercent] = useState('30')
  const nextKey = useRef(1)

  const addLine = (name: string, unitPrice: string) =>
    setLines((ls) => [...ls, { key: `l${nextKey.current++}`, name, unitPrice, quantity: '1', discount: '0' }])
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key))
  const patch = (key: string, field: keyof Line, value: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)))

  const totals = useMemo(
    () => estimateTotals(lines.map((l) => ({ unitPriceCents: toCents(l.unitPrice), quantity: Number.parseInt(l.quantity || '0', 10) || 0, discountCents: toCents(l.discount) }))),
    [lines],
  )
  const pct = Math.min(100, Math.max(0, Number.parseFloat(depositPercent || '0') || 0))
  const deposit = useMemo(() => estimateDeposit(totals.totalCents, pct), [totals.totalCents, pct])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Catalogue: fixed prices from the website. */}
      <section className="rounded-lg border border-line bg-surface p-5 lg:col-span-1">
        <h2 className="mb-1 text-sm font-bold text-ink">Packages</h2>
        <p className="mb-3 text-sm text-ink-muted">Fixed catalogue prices. Click to add to the quote.</p>
        {packages.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-paper px-4 py-6 text-center text-sm text-ink-muted">No active packages in the catalogue.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {packages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                  <div className="text-xs text-muted tabular-nums">{formatCents(toCents(p.price))} incl. GST</div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => addLine(p.name, p.price)}>Add</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => addLine('Custom item', '')}>+ Add custom line</Button>
        </div>
      </section>

      {/* The quote being built + the live breakdown. */}
      <section className="rounded-lg border border-line bg-surface p-5 lg:col-span-2">
        <h2 className="mb-3 text-sm font-bold text-ink">Quote</h2>

        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-paper px-4 py-10 text-center text-sm text-ink-muted">Add a package to start the quote.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Unit price</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Discount</th>
                  <th className="py-2 pr-3 text-right font-medium">Line total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const lineTotal = Math.max(toCents(l.unitPrice) * (Number.parseInt(l.quantity || '0', 10) || 0) - toCents(l.discount), 0)
                  return (
                    <tr key={l.key} className="border-b border-line align-middle">
                      <td className="py-2 pr-3">
                        <TextInput value={l.name} onChange={(e) => patch(l.key, 'name', e.target.value)} className="min-w-40" aria-label="Item name" />
                      </td>
                      <td className="py-2 pr-3">
                        <TextInput value={l.unitPrice} onChange={(e) => patch(l.key, 'unitPrice', e.target.value)} inputMode="decimal" className="w-24" aria-label="Unit price" />
                      </td>
                      <td className="py-2 pr-3">
                        <TextInput value={l.quantity} onChange={(e) => patch(l.key, 'quantity', e.target.value)} inputMode="numeric" className="w-16" aria-label="Quantity" />
                      </td>
                      <td className="py-2 pr-3">
                        <TextInput value={l.discount} onChange={(e) => patch(l.key, 'discount', e.target.value)} inputMode="decimal" className="w-24" aria-label="Discount" />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{formatCents(lineTotal)}</td>
                      <td className="py-2 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(l.key)} aria-label="Remove line">Remove</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Live breakdown - the arithmetic the app does on the catalogue prices. */}
        <div className="mt-5 rounded-md border border-line bg-paper p-4">
          <dl className="flex flex-col gap-1.5 text-sm">
            <Row label="Subtotal (before discount)" value={formatCents(totals.grossCents)} />
            <Row label="Total discount" value={totals.discountCents ? `- ${formatCents(totals.discountCents)}` : formatCents(0)} />
            <div className="my-1 border-t border-line" />
            <Row label="Total payable (incl. GST)" value={formatCents(totals.totalCents)} strong />
            <Row label="GST included (÷ 11)" value={formatCents(totals.gstCents)} muted />
            <Row label="Price ex-GST" value={formatCents(totals.exGstCents)} muted />
            <div className="my-1 border-t border-line" />
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-ink">
                Deposit
                <span className="inline-flex items-center gap-1">
                  <TextInput value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} inputMode="numeric" className="w-16" aria-label="Deposit percent" />
                  <span className="text-ink-muted">%</span>
                </span>
              </dt>
              <dd className="tabular-nums font-medium text-ink">{formatCents(deposit.depositCents)}</dd>
            </div>
            <Row label="Balance due later" value={formatCents(deposit.balanceCents)} muted />
          </dl>
        </div>

        <p className="mt-3 text-xs text-muted">
          Prices are fixed catalogue values (from the company website); this screen only totals them. GST is
          extracted at the ATO rate (total ÷ 11); the deposit percentage is the studio&rsquo;s own policy.
          Method &amp; sources: docs/30.
        </p>
      </section>
    </div>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-ink-muted' : 'text-ink'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-bold text-ink' : muted ? 'text-ink-muted' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
