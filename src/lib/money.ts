import { Prisma } from '@prisma/client'

/**
 * Format a stored Decimal as Australian currency for display only, never for arithmetic.
 * Money stays as Prisma.Decimal everywhere else (ADR-0001, D6).
 */
export function formatAud(value: Prisma.Decimal): string {
  const fixed = value.toFixed(2)
  const dot = fixed.indexOf('.')
  const whole = fixed.slice(0, dot)
  const cents = fixed.slice(dot + 1)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${grouped}.${cents}`
}

/** A zero price means the studio has not published a figure yet (see the seed and OPEN-QUESTIONS). */
export function isPriceOnEnquiry(value: Prisma.Decimal): boolean {
  return value.isZero()
}
