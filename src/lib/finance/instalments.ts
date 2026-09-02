/**
 * Generic instalment engine (Payment Schedule Builder). Staff enter percentages; amounts are
 * derived here, decimal-safe, in integer cents. The final instalment absorbs any rounding remainder
 * so the instalments ALWAYS sum exactly to the invoice total - never off by a cent. Works for any
 * valid schedule (10/50/40, 25/25/25/25, 5/45/50, ...), not a fixed set of named combinations.
 */

/** Round a decimal-string money amount to whole cents (banker-free, half-up). */
export function toCents(amount: string | number): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Format whole cents back to a 2dp string ("175000" -> "1750.00"). */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Split a total (in cents) across the given percentages. Every instalment but the last is rounded to
 * the nearest cent; the last takes whatever remains, guaranteeing sum === totalCents.
 * Assumes the percentages are the intended split (validate sum === 100 before calling for a real save).
 */
export function computeAmountsCents(totalCents: number, percents: number[]): number[] {
  if (percents.length === 0) return []
  const out: number[] = []
  let acc = 0
  for (let i = 0; i < percents.length - 1; i++) {
    const c = Math.round((totalCents * (percents[i] ?? 0)) / 100)
    out.push(c)
    acc += c
  }
  out.push(totalCents - acc)
  return out
}

/** Sum of percentages, rounded to 2dp to avoid float noise (e.g. 33.33 + 33.33 + 33.34 = 100). */
export function sumPercents(percents: number[]): number {
  return Math.round(percents.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0) * 100) / 100
}

/** True when the percentages allocate exactly 100%. */
export function isFullyAllocated(percents: number[]): boolean {
  return sumPercents(percents) === 100
}
