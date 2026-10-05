/**
 * Invoice payment-schedule presets (pure logic, no UI) used by the New invoice form's schedule picker.
 * Kept separate from the component so the money maths is unit-tested directly.
 */

export type SchedulePreset = 'D25_B75_SHOOT14' | 'D50_B50_30D' | 'D50_B50_SHOOT' | 'DUE7' | 'DUE_ON_ISSUE'
/** NONE = one full payment on issue; CUSTOM = hand-edited instalments; otherwise a preset. */
export type ScheduleKey = 'NONE' | 'CUSTOM' | SchedulePreset
export type ScheduleRow = { label: string; dueAt: string; amount: string }

export const NONE_SCHEDULE_LABEL = 'No split payments'

export const SCHEDULE_PRESETS: { key: SchedulePreset; label: string; needsShoot: boolean }[] = [
  { key: 'D25_B75_SHOOT14', label: '25% Deposit + 75% due 14 days before Main Shoot Date', needsShoot: true },
  { key: 'D50_B50_30D', label: '50% Deposit + 50% due in 30 days', needsShoot: false },
  { key: 'D50_B50_SHOOT', label: '50% Deposit + 50% on Main Shoot Date', needsShoot: true },
  { key: 'DUE7', label: 'Due in 7 Days', needsShoot: false },
  { key: 'DUE_ON_ISSUE', label: 'Due on Invoice Date', needsShoot: false },
]

export function scheduleLabel(key: ScheduleKey): string {
  if (key === 'NONE') return NONE_SCHEDULE_LABEL
  if (key === 'CUSTOM') return 'Custom schedule'
  return SCHEDULE_PRESETS.find((p) => p.key === key)?.label ?? NONE_SCHEDULE_LABEL
}

/** Shift a YYYY-MM-DD calendar date by n days (timezone-neutral). */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
/** A YYYY-MM-DD calendar date as "29 Oct 2026" (Australian English, the app's display format). */
export function formatScheduleDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)))
}
/** The later of two YYYY-MM-DD dates (a due date never falls before the invoice is issued). */
const later = (a: string, b: string) => (a > b ? a : b)

/**
 * A preset's instalments for the invoice total. Worked in whole cents and the last instalment takes the
 * remainder, so the schedule always adds up exactly to the total the server recomputes (it rejects any
 * mismatch). Returns null only when it cannot be calculated at all: a $0 total or no issue date. A
 * shoot-based preset on a job with no shoot date yet still returns a COMPLETE schedule - the shoot-relative
 * instalment falls back to a 30-day net date so the amounts and dates are all filled like every other
 * preset; it recomputes to the real shoot-relative date once the job has a shoot date.
 */
export function presetRows(key: SchedulePreset, total: number, issueDate: string, shootDate: string | null): ScheduleRow[] | null { // money-ok: client preview in integer cents; the server recomputes in Decimal
  const cents = Math.round(total * 100)
  if (cents <= 0 || !issueDate) return null
  const amt = (c: number) => (c / 100).toFixed(2)
  const deposit = (pct: number) => Math.round(cents * pct)
  // Fallback for a shoot-relative due date when the job has no shoot date yet: a 30-day net date, so the
  // schedule is fully calculated like the non-shoot presets (staff can still adjust it via "Customise").
  const shootDue = (offsetDays: number) => (shootDate ? later(addDays(shootDate, offsetDays), issueDate) : addDays(issueDate, 30))
  switch (key) {
    case 'D25_B75_SHOOT14': {
      const d = deposit(0.25)
      return [
        { label: 'Deposit (25%)', dueAt: issueDate, amount: amt(d) },
        { label: 'Final payment (75%)', dueAt: shootDue(-14), amount: amt(cents - d) },
      ]
    }
    case 'D50_B50_30D': {
      const d = deposit(0.5)
      return [
        { label: 'Deposit (50%)', dueAt: issueDate, amount: amt(d) },
        { label: 'Final payment (50%)', dueAt: addDays(issueDate, 30), amount: amt(cents - d) },
      ]
    }
    case 'D50_B50_SHOOT': {
      const d = deposit(0.5)
      return [
        { label: 'Deposit (50%)', dueAt: issueDate, amount: amt(d) },
        { label: 'Final payment (50%)', dueAt: shootDue(0), amount: amt(cents - d) },
      ]
    }
    case 'DUE7':
      return [{ label: 'Full payment', dueAt: addDays(issueDate, 7), amount: amt(cents) }]
    case 'DUE_ON_ISSUE':
      return [{ label: 'Full payment', dueAt: issueDate, amount: amt(cents) }]
  }
}
