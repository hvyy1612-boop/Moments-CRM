/**
 * Client-safe pricing estimator for the interactive Price calculator (brief: "pricing calculations").
 *
 * This is a browser-safe MIRROR of the sourced, Decimal-based `src/lib/domain/pricing.ts` so the calculator
 * can total live as the user picks packages, without a server round-trip and without shipping Prisma to the
 * client. It computes in INTEGER CENTS (exact, no float drift) using the SAME published formulas:
 *   - line net = unitPrice × qty − discount, floored at 0  (OpenStax Contemporary Mathematics §6.2)
 *   - GST split = total ÷ 11, half-up                       (ATO)
 *   - deposit  = total × percent / 100, half-up             (percent = studio policy input)
 * See docs/30-pricing-method.md for citations. `tests/unit/pricing-estimate.test.ts` asserts this mirror
 * equals `pricing.ts` across a range of inputs, so the two can never silently diverge.
 *
 * The prices themselves are NOT computed here — they come from the studio's fixed catalogue (the package
 * `basePriceInclGst` taken from the company website). This module only does the arithmetic on top.
 */

const GST_DIVISOR = 11

export type EstimateLine = { unitPriceCents: number; quantity: number; discountCents?: number }

export type Estimate = {
  grossCents: number // Σ unitPrice × quantity (before discounts)
  discountCents: number // Σ line discounts
  totalCents: number // amount payable, GST-inclusive = gross − discount
  gstCents: number // GST component (total ÷ 11)
  exGstCents: number // total ex-GST
}

/** Half-up integer division a/b for non-negative integers (matches Decimal ROUND_HALF_UP for positives). */
function halfUpDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b))
}

/** Total an estimate from its lines, mirroring `computeQuoteTotals`. All money in integer cents. */
export function estimateTotals(lines: EstimateLine[]): Estimate {
  let grossCents = 0
  let discountCents = 0
  let totalCents = 0
  for (const line of lines) {
    const gross = Math.round(line.unitPriceCents) * Math.round(line.quantity)
    const discount = Math.round(line.discountCents ?? 0)
    grossCents += gross
    discountCents += discount
    totalCents += Math.max(gross - discount, 0)
  }
  const gstCents = halfUpDiv(totalCents, GST_DIVISOR)
  return { grossCents, discountCents, totalCents, gstCents, exGstCents: totalCents - gstCents }
}

export type DepositEstimate = { depositCents: number; balanceCents: number }

/** Split a total into deposit + balance at a studio-chosen percent (0–100), mirroring `computeDeposit`. */
export function estimateDeposit(totalCents: number, depositPercent: number): DepositEstimate {
  if (depositPercent < 0 || depositPercent > 100) throw new Error('Deposit percent must be between 0 and 100.')
  const depositCents = halfUpDiv(Math.round(totalCents) * depositPercent, 100)
  return { depositCents, balanceCents: Math.round(totalCents) - depositCents }
}

/** Parse a user-typed money string (e.g. "3500", "3500.50") to integer cents; invalid → 0. */
export function toCents(value: string): number {
  const n = Number.parseFloat(String(value).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Format integer cents as AUD, e.g. 375000 → "$3,750.00". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
