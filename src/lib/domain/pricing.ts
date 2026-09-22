import { Prisma } from '@prisma/client'
import { splitGstInclusive } from '@/lib/money'

/**
 * Pricing calculations (company brief: "pricing calculations"). Pure and DB-agnostic. Every formula
 * here follows a published method — see docs/30-pricing-method.md for the citations; nothing is invented:
 *
 *  - discount / markup / sales-tax arithmetic → OpenStax, *Contemporary Mathematics* §6.2
 *  - cost-plus pricing (price = cost × (1 + markup)) → OpenStax, *Principles of Marketing* §12.3;
 *    Springer, "Value-Based and Cost-Based Pricing Concepts"; PPA "Cost of Doing Business" for the
 *    photography-studio application
 *  - GST split (÷ 11) → ATO, reused from `splitGstInclusive`
 *  - deposit % is a STUDIO POLICY input, not a sourced constant (there is no single industry-standard
 *    figure — docs/30); the calculation rounds it, the value is chosen by the studio.
 *
 * Money is exact decimal (Prisma.Decimal), never float. Rounding is half-up to 2 dp, matching the GST
 * helper, so line + tax + deposit figures reconcile to the cent.
 */

const HALF_UP = Prisma.Decimal.ROUND_HALF_UP
const ZERO = new Prisma.Decimal(0)
const HUNDRED = new Prisma.Decimal(100)
type DecInput = Prisma.Decimal | string | number
const D = (v: DecInput): Prisma.Decimal => new Prisma.Decimal(v)
const money2 = (v: Prisma.Decimal): Prisma.Decimal => v.toDecimalPlaces(2, HALF_UP)
const clampNonNeg = (v: Prisma.Decimal): Prisma.Decimal => (v.lessThan(ZERO) ? ZERO : v)

/** A quote/estimate line. `discount` is a per-line amount off (GST-inclusive), matching QuoteLine.discount. */
export type PricingLine = { unitPrice: DecInput; quantity: DecInput; discount?: DecInput }

export type QuoteTotals = {
  grossSubtotal: Prisma.Decimal // Σ unitPrice × quantity, before line discounts (GST-inclusive)
  discountTotal: Prisma.Decimal // Σ line discounts
  total: Prisma.Decimal // GST-inclusive amount payable = grossSubtotal − discountTotal
  exGst: Prisma.Decimal // total ex-GST
  gst: Prisma.Decimal // GST component (total ÷ 11)
}

/**
 * Total a quote/estimate from its lines. Per-line: net = unitPrice × qty − discount (clamped ≥ 0),
 * i.e. the discount reduces the price (OpenStax Contemporary Mathematics §6.2). GST is then extracted
 * from the inclusive total via the ATO ÷11 method (reused).
 */
export function computeQuoteTotals(lines: PricingLine[]): QuoteTotals {
  let grossSubtotal = ZERO
  let discountTotal = ZERO
  let total = ZERO
  for (const line of lines) {
    const gross = D(line.unitPrice).mul(D(line.quantity))
    const discount = line.discount === undefined ? ZERO : D(line.discount)
    grossSubtotal = grossSubtotal.add(gross)
    discountTotal = discountTotal.add(discount)
    total = total.add(clampNonNeg(gross.sub(discount)))
  }
  total = money2(total)
  const { subtotal: exGst, taxTotal: gst } = splitGstInclusive(total)
  return { grossSubtotal: money2(grossSubtotal), discountTotal: money2(discountTotal), total, exGst, gst }
}

export type DepositResult = { deposit: Prisma.Decimal; balance: Prisma.Decimal }

/**
 * Deposit / retainer split. `depositPercent` is the studio's own policy value (0–100) — there is no
 * single industry-standard figure (docs/30), so it is an input, not a constant. deposit = round(total ×
 * pct/100); balance = total − deposit.
 */
export function computeDeposit(total: DecInput, depositPercent: DecInput): DepositResult {
  const t = D(total)
  const pct = D(depositPercent)
  if (pct.lessThan(ZERO) || pct.greaterThan(HUNDRED)) throw new Error('Deposit percent must be between 0 and 100.')
  const deposit = money2(t.mul(pct).div(HUNDRED))
  return { deposit, balance: money2(t.sub(deposit)) }
}

/**
 * Cost-plus price: selling price = cost × (1 + markup%). The published cost-based method (OpenStax
 * *Principles of Marketing* §12.3; OpenStax *Contemporary Mathematics* §6.2 markup; PPA "Cost of Doing
 * Business" for a studio). A studio using this feeds its CODB-derived cost and target margin; the app
 * does not fabricate either number.
 */
export function costPlusPrice(cost: DecInput, markupPercent: DecInput): Prisma.Decimal {
  const c = D(cost)
  const m = D(markupPercent)
  if (c.lessThan(ZERO)) throw new Error('Cost cannot be negative.')
  if (m.lessThan(ZERO)) throw new Error('Markup percent cannot be negative.')
  return money2(c.mul(HUNDRED.add(m).div(HUNDRED)))
}
