import { Prisma } from '@prisma/client'

/**
 * Format a stored Decimal as Australian currency for display only, never for arithmetic.
 * Money stays as Prisma.Decimal everywhere else (ADR-0001, D6).
 */
export function formatAud(value: Prisma.Decimal): string {
  // The sign belongs in front of the currency symbol: a discount reads "-$150.00", never
  // "$-150.00". Discount lines are negative, so this is the normal case on a quotation.
  const negative = value.isNegative()
  const fixed = value.absoluteValue().toFixed(2)
  const dot = fixed.indexOf('.')
  const whole = fixed.slice(0, dot)
  const cents = fixed.slice(dot + 1)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${grouped}.${cents}`
}

const GST_DIVISOR = new Prisma.Decimal(11)
const ROUND_HALF_UP = 4 // Decimal.js rounding mode

/**
 * Split a GST-inclusive total into its GST component and the ex-GST subtotal (BR-P01/P02). The total
 * is what the client pays; GST is total / 11, rounded half up. Used by quotes and invoices alike.
 */
export function splitGstInclusive(total: Prisma.Decimal): {
  subtotal: Prisma.Decimal
  taxTotal: Prisma.Decimal
} {
  const taxTotal = total.div(GST_DIVISOR).toDecimalPlaces(2, ROUND_HALF_UP)
  return { subtotal: total.sub(taxTotal), taxTotal }
}
