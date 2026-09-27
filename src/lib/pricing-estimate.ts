

const GST_DIVISOR = 11

export type EstimateLine = { unitPriceCents: number; quantity: number; discountCents?: number }

export type Estimate = {
  grossCents: number
  discountCents: number
  totalCents: number
  gstCents: number
  exGstCents: number
}

function halfUpDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b))
}

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

export function estimateDeposit(totalCents: number, depositPercent: number): DepositEstimate {
  if (depositPercent < 0 || depositPercent > 100) throw new Error('Deposit percent must be between 0 and 100.')
  const depositCents = halfUpDiv(Math.round(totalCents) * depositPercent, 100)
  return { depositCents, balanceCents: Math.round(totalCents) - depositCents }
}

export function toCents(value: string): number {
  const n = Number.parseFloat(String(value).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
