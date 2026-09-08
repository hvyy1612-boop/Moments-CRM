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

/** Format an instant as "14 Mar 2027, 2:00 pm" in the Sydney zone. */
export function formatSydneyDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** The offset of a time zone from UTC, in milliseconds, at a given instant (positive east of UTC). */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const at: Record<string, number> = {}
  for (const part of parts) if (part.type !== 'literal') at[part.type] = Number(part.value)
  const wall = Date.UTC(at.year!, at.month! - 1, at.day!, at.hour!, at.minute!, at.second!)
  return wall - instant.getTime()
}

/**
 * Convert a "YYYY-MM-DDTHH:mm" wall-clock time in the Sydney zone to a UTC instant. Staff type a
 * local time in the studio's zone; we store the absolute instant. Two passes make it correct across
 * daylight-saving transitions (Intl, no timezone library, R3).
 */
export function sydneyLocalToUtc(local: string): Date {
  const withSeconds = local.length === 16 ? `${local}:00` : local
  const naive = new Date(`${withSeconds}Z`) // the wall time read as if it were UTC
  const guess = new Date(naive.getTime() - zoneOffsetMs(SYDNEY, naive))
  return new Date(naive.getTime() - zoneOffsetMs(SYDNEY, guess))
}

/** Two half-open time ranges overlap when each starts before the other ends. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** The calendar month (1 to 12) of an instant in the Sydney zone (BR-X01). */
export function sydneyMonth(date: Date): number {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, month: 'numeric' })
    .formatToParts(date)
    .find((p) => p.type === 'month')
  return part ? Number(part.value) : Number.NaN
}

/** Year, month (1 to 12) and day-of-month of an instant, all read in the Sydney zone (BR-X01). */
export function sydneyYmd(date: Date): { year: number; month: number; day: number } {
  const at: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)) {
    if (part.type !== 'literal') at[part.type] = part.value
  }
  return { year: Number(at.year), month: Number(at.month), day: Number(at.day) }
}

/** The Sydney-zone calendar date ("YYYY-MM-DD") and 24h wall-clock time ("HH:mm:ss") of an instant,
 *  for pre-filling separate date and time (with seconds) form inputs. */
export function sydneyDateTimeParts(date: Date): { date: string; time: string } {
  const at: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: SYDNEY,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    if (part.type !== 'literal') at[part.type] = part.value
  }
  return { date: `${at.year}-${at.month}-${at.day}`, time: `${at.hour}:${at.minute}:${at.second}` }
}

/** Format an instant as "2:00 pm" in the Sydney zone (time only). */
export function formatSydneyTime(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
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
