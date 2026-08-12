

export type Clock = { now(): Date }

export const systemClock: Clock = { now: () => new Date() }

const SYDNEY = 'Australia/Sydney'

export function formatSydneyDate(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function sydneyMonth(date: Date): number {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, month: 'numeric' })
    .formatToParts(date)
    .find((p) => p.type === 'month')
  return part ? Number(part.value) : Number.NaN
}

const PEAK_MONTHS = new Set([3, 4, 5, 9, 10, 11])

export function isPeakSeason(shootDate: Date): boolean {
  return PEAK_MONTHS.has(sydneyMonth(shootDate))
}

export function daysUntil(date: Date, from: Date): number {
  return Math.round((date.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}
