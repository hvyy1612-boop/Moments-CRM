// Time helpers (BR-X01, BR-X05, BR-X09). Timestamps are stored in UTC; display and business date
// calculations happen in the Australia/Sydney zone, including daylight saving. We use Intl rather
// than adding a timezone library, so there is no extra dependency (R3).

export type Clock = { now(): Date }

/** The real clock. Tests inject their own so no test depends on the wall clock (BR-X09). */
export const systemClock: Clock = { now: () => new Date() }

const SYDNEY = 'Australia/Sydney'

/** Format an instant as "14 Mar 2027" in the Sydney zone (Australian English, §10.3). */
export function formatSydneyDate(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** The calendar month (1 to 12) of an instant in the Sydney zone (BR-X01). */
export function sydneyMonth(date: Date): number {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, month: 'numeric' })
    .formatToParts(date)
    .find((p) => p.type === 'month')
  return part ? Number(part.value) : Number.NaN
}

// Peak season is the whole of March, April, May, September, October and November (BR-X05).
const PEAK_MONTHS = new Set([3, 4, 5, 9, 10, 11])

/** Whether a shoot date falls in peak season, evaluated in the Sydney zone (BR-D03, BR-X05). */
export function isPeakSeason(shootDate: Date): boolean {
  return PEAK_MONTHS.has(sydneyMonth(shootDate))
}

/** Whole days from `from` until `date`; positive when `date` is in the future (§10.3). */
export function daysUntil(date: Date, from: Date): number {
  return Math.round((date.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}
