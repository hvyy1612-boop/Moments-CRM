

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

export function sydneyLocalToUtc(local: string): Date {
  const withSeconds = local.length === 16 ? `${local}:00` : local
  const naive = new Date(`${withSeconds}Z`)
  const guess = new Date(naive.getTime() - zoneOffsetMs(SYDNEY, naive))
  return new Date(naive.getTime() - zoneOffsetMs(SYDNEY, guess))
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function sydneyMonth(date: Date): number {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, month: 'numeric' })
    .formatToParts(date)
    .find((p) => p.type === 'month')
  return part ? Number(part.value) : Number.NaN
}

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

export function daysUntilSydney(due: Date, now: Date = new Date()): number {
  const a = sydneyYmd(due)
  const b = sydneyYmd(now)
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000)
}

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

export function formatSydneyTime(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

const PEAK_MONTHS = new Set([3, 4, 5, 9, 10, 11])

export function isPeakSeason(shootDate: Date): boolean {
  return PEAK_MONTHS.has(sydneyMonth(shootDate))
}

export function daysUntil(date: Date, from: Date): number {
  return Math.round((date.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}
