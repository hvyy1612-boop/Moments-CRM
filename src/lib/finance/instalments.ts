

export function toCents(amount: string | number): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

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

export function sumPercents(percents: number[]): number {
  return Math.round(percents.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0) * 100) / 100
}

export function isFullyAllocated(percents: number[]): boolean {
  return sumPercents(percents) === 100
}
