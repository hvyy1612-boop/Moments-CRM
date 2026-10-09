import { formatSydneyDate } from '@/lib/time'

/**
 * The staff "Add lead" form (docs/23 §4). Holds the option lists and the ONE validation that both the
 * browser (instant red lines) and the server action run, so the two can never disagree. A lead is only
 * created when this passes and the staff member presses Save lead - nothing is stored before that.
 */

/** Job type, stored in `enquiries.coverage`. "Other" needs a note saying what the client is asking for. */
export const JOB_TYPES = [
  { value: 'Photography', label: 'Photography' },
  { value: 'Videography', label: 'Videography' },
  { value: 'Both', label: 'Both', detail: 'Photography & Videography' },
  { value: 'Other', label: 'Other' },
] as const
export type JobType = (typeof JOB_TYPES)[number]['value']

/** One workflow for now: every lead follows the wedding workflow. Stored in `enquiries.event_type`. */
export const LEAD_WORKFLOWS = ['Wedding'] as const

/** "How did you hear about us?" - the options on the studio website's Contact Us form, same order. */
export const LEAD_SOURCES = [
  'ABIA',
  'ChatGPT',
  'Easy Weddings',
  'Facebook',
  'Gemini',
  'Google',
  'Instagram',
  'Pinterest',
  'TikTok',
  'Wedshed',
  'Referral - Celebrant',
  'Referral - Friend/Family',
  'Referral - Vendor/Venue',
  'YouTube',
] as const

/** Form field names; an error is keyed by the field it belongs to. */
export type NewLeadField =
  | 'leadName'
  | 'jobType'
  | 'jobTypeNote'
  | 'workflow'
  | 'source'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'note'
export type NewLeadErrors = Partial<Record<NewLeadField, string>>

export type NewLead = {
  name: string
  coverage: JobType
  coverageNote: string | null
  eventType: string
  heardAbout: string | null
  eventDate: Date | null
  eventEndDate: Date | null
  eventStartTime: string | null
  eventEndTime: string | null
  eventLocation: string | null
  message: string | null
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/

/** A real calendar day from an <input type="date"> value, as UTC midnight (how @db.Date is stored). */
function parseDay(value: string): Date | null {
  const m = DATE_RE.exec(value)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null
}

/** "HH:MM" from an <input type="time"> value (seconds dropped), or null when it is not a time. */
function parseTime(value: string): string | null {
  const m = TIME_RE.exec(value)
  return m ? `${m[1]}:${m[2]}` : null
}

const has = (list: readonly string[], value: string) => list.includes(value)

/** `noun` only words the name messages: the same form adds a lead, or a job already confirmed (Add job). */
export function parseNewLead(fd: FormData, noun: 'lead' | 'job' = 'lead'): { ok: true; lead: NewLead } | { ok: false; errors: NewLeadErrors } {
  const s = (k: string) => String(fd.get(k) ?? '').trim()
  const errors: NewLeadErrors = {}

  const name = s('leadName')
  if (!name) errors.leadName = `Please enter a ${noun} name.`
  else if (name.length > 150) errors.leadName = `Please keep the ${noun} name under 150 characters.`

  const jobType = s('jobType')
  if (!has(JOB_TYPES.map((j) => j.value), jobType)) errors.jobType = 'Please choose a job type.'
  const jobTypeNote = jobType === 'Other' ? s('jobTypeNote') : ''
  if (jobType === 'Other') {
    if (!jobTypeNote) errors.jobTypeNote = 'Please note what the client is asking for.'
    else if (jobTypeNote.length > 300) errors.jobTypeNote = 'Please keep this under 300 characters.'
  }

  const workflow = s('workflow') || LEAD_WORKFLOWS[0]
  if (!has(LEAD_WORKFLOWS, workflow)) errors.workflow = 'Please choose a workflow.'

  const source = s('source')
  if (source && !has(LEAD_SOURCES, source)) errors.source = 'Please choose a source from the list.'

  // Main shoot. "Date not confirmed yet" stores no date at all; "All day" (or no times) stores no times.
  let eventDate: Date | null = null
  let eventEndDate: Date | null = null
  let eventStartTime: string | null = null
  let eventEndTime: string | null = null
  if (fd.get('dateUnconfirmed') !== 'on') {
    const startRaw = s('startDate')
    eventDate = parseDay(startRaw)
    if (!startRaw) errors.startDate = "Please choose the shoot date, or tick 'Date not confirmed yet'."
    else if (!eventDate) errors.startDate = 'Please enter a valid date.'

    const endRaw = s('endDate')
    if (endRaw) {
      eventEndDate = parseDay(endRaw)
      if (!eventEndDate) errors.endDate = 'Please enter a valid date.'
      else if (eventDate && eventEndDate < eventDate) errors.endDate = 'The end date cannot be before the start date.'
    }

    if (fd.get('allDay') !== 'on') {
      const startTimeRaw = s('startTime')
      const endTimeRaw = s('endTime')
      eventStartTime = startTimeRaw ? parseTime(startTimeRaw) : null
      eventEndTime = endTimeRaw ? parseTime(endTimeRaw) : null
      if (startTimeRaw && !eventStartTime) errors.startTime = 'Please enter a valid time.'
      if (endTimeRaw && !eventEndTime) errors.endTime = 'Please enter a valid time.'
      if (eventEndTime && !startTimeRaw) errors.startTime = 'Please add the start time too.'
      const oneDay = !eventEndDate || (eventDate !== null && eventEndDate.getTime() === eventDate.getTime())
      if (eventStartTime && eventEndTime && oneDay && eventEndTime <= eventStartTime) {
        errors.endTime = 'The end time must be after the start time.'
      }
    }
    // Ending on the start day is just a one-day shoot.
    if (eventDate && eventEndDate && eventEndDate.getTime() === eventDate.getTime()) eventEndDate = null
  }

  const location = s('location')
  if (location.length > 300) errors.location = 'Please keep the location under 300 characters.'
  const note = s('note')
  if (note.length > 5000) errors.note = 'Please keep the note under 5000 characters.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    lead: {
      name,
      coverage: jobType as JobType,
      coverageNote: jobTypeNote || null,
      eventType: workflow,
      heardAbout: source || null,
      eventDate,
      eventEndDate,
      eventStartTime,
      eventEndTime,
      eventLocation: location || null,
      message: note || null,
    },
  }
}

/** "14:30" -> "2:30 pm". */
function time12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/**
 * The main shoot as one line: "14 Mar 2027 · 2:00 pm to 10:00 pm", "14 Mar 2027 to 15 Mar 2027 · All day".
 * Null when no date is set (date not confirmed yet).
 */
export function formatShootWindow(e: {
  eventDate: Date | null
  eventEndDate?: Date | null
  eventStartTime?: string | null
  eventEndTime?: string | null
}): string | null {
  if (!e.eventDate) return null
  const days = e.eventEndDate ? `${formatSydneyDate(e.eventDate)} to ${formatSydneyDate(e.eventEndDate)}` : formatSydneyDate(e.eventDate)
  const hours = e.eventStartTime
    ? e.eventEndTime
      ? `${time12(e.eventStartTime)} to ${time12(e.eventEndTime)}`
      : `from ${time12(e.eventStartTime)}`
    : 'All day'
  return `${days} · ${hours}`
}

/** The job type as staff read it: "Both (Photography & Videography)", "Other: drone footage only". */
export function jobTypeLabel(coverage: string | null, note?: string | null): string | null {
  if (!coverage) return null
  if (coverage === 'Both') return 'Both (Photography & Videography)'
  if (coverage === 'Other' && note) return `Other: ${note}`
  return coverage
}
