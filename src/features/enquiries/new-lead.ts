import { formatSydneyDate } from '@/lib/time'

export const JOB_TYPES = [
  { value: 'Photography', label: 'Photography' },
  { value: 'Videography', label: 'Videography' },
  { value: 'Both', label: 'Both', detail: 'Photography & Videography' },
  { value: 'Other', label: 'Other' },
] as const
export type JobType = (typeof JOB_TYPES)[number]['value']

export const LEAD_WORKFLOWS = ['Wedding'] as const

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

function parseDay(value: string): Date | null {
  const m = DATE_RE.exec(value)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null
}

function parseTime(value: string): string | null {
  const m = TIME_RE.exec(value)
  return m ? `${m[1]}:${m[2]}` : null
}

const has = (list: readonly string[], value: string) => list.includes(value)

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

function time12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

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

export function jobTypeLabel(coverage: string | null, note?: string | null): string | null {
  if (!coverage) return null
  if (coverage === 'Both') return 'Both (Photography & Videography)'
  if (coverage === 'Other' && note) return `Other: ${note}`
  return coverage
}
