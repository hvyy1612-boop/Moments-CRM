import { Prisma } from '@prisma/client'
import { splitGstInclusive } from '@/lib/money'

const HALF_UP = Prisma.Decimal.ROUND_HALF_UP
const ZERO = new Prisma.Decimal(0)
const HUNDRED = new Prisma.Decimal(100)
type DecInput = Prisma.Decimal | string | number
const D = (v: DecInput): Prisma.Decimal => new Prisma.Decimal(v)
const money2 = (v: Prisma.Decimal): Prisma.Decimal => v.toDecimalPlaces(2, HALF_UP)
const clampNonNeg = (v: Prisma.Decimal): Prisma.Decimal => (v.lessThan(ZERO) ? ZERO : v)

export type PricingLine = { unitPrice: DecInput; quantity: DecInput; discount?: DecInput }

export type QuoteTotals = {
  grossSubtotal: Prisma.Decimal
  discountTotal: Prisma.Decimal
  total: Prisma.Decimal
  exGst: Prisma.Decimal
  gst: Prisma.Decimal
}

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

export function computeDeposit(total: DecInput, depositPercent: DecInput): DepositResult {
  const t = D(total)
  const pct = D(depositPercent)
  if (pct.lessThan(ZERO) || pct.greaterThan(HUNDRED)) throw new Error('Deposit percent must be between 0 and 100.')
  const deposit = money2(t.mul(pct).div(HUNDRED))
  return { deposit, balance: money2(t.sub(deposit)) }
}

export function costPlusPrice(cost: DecInput, markupPercent: DecInput): Prisma.Decimal {
  const c = D(cost)
  const m = D(markupPercent)
  if (c.lessThan(ZERO)) throw new Error('Cost cannot be negative.')
  if (m.lessThan(ZERO)) throw new Error('Markup percent cannot be negative.')
  return money2(c.mul(HUNDRED.add(m).div(HUNDRED)))
}
