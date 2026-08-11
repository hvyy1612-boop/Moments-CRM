import { Prisma } from '@prisma/client'

export function formatAud(value: Prisma.Decimal): string {
  const fixed = value.toFixed(2)
  const dot = fixed.indexOf('.')
  const whole = fixed.slice(0, dot)
  const cents = fixed.slice(dot + 1)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${grouped}.${cents}`
}

export function isPriceOnEnquiry(value: Prisma.Decimal): boolean {
  return value.isZero()
}
