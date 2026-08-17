import { Prisma } from '@prisma/client'

export function formatAud(value: Prisma.Decimal): string {

  const negative = value.isNegative()
  const fixed = value.absoluteValue().toFixed(2)
  const dot = fixed.indexOf('.')
  const whole = fixed.slice(0, dot)
  const cents = fixed.slice(dot + 1)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${grouped}.${cents}`
}

export function isPriceOnEnquiry(value: Prisma.Decimal): boolean {
  return value.isZero()
}

const GST_DIVISOR = new Prisma.Decimal(11)
const ROUND_HALF_UP = 4

export function splitGstInclusive(total: Prisma.Decimal): {
  subtotal: Prisma.Decimal
  taxTotal: Prisma.Decimal
} {
  const taxTotal = total.div(GST_DIVISOR).toDecimalPlaces(2, ROUND_HALF_UP)
  return { subtotal: total.sub(taxTotal), taxTotal }
}
