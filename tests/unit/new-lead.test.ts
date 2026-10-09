import { describe, expect, it } from 'vitest'
import { formatShootWindow, jobTypeLabel, parseNewLead } from '@/features/enquiries/new-lead'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const base = { leadName: 'Jenny & Matt', jobType: 'Photography', workflow: 'Wedding', startDate: '2027-03-14' }

describe('parseNewLead', () => {
  it('accepts the minimum: name, job type and a shoot date', () => {
    const r = parseNewLead(form(base))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lead).toMatchObject({ name: 'Jenny & Matt', coverage: 'Photography', eventType: 'Wedding', heardAbout: null })
    expect(r.lead.eventDate?.toISOString()).toBe('2027-03-14T00:00:00.000Z')
    expect(r.lead.eventStartTime).toBeNull()
  })

  it('requires a lead name, a job type and a date unless the date is not confirmed', () => {
    const r = parseNewLead(form({}))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual(['jobType', 'leadName', 'startDate'])

    const unconfirmed = parseNewLead(form({ ...base, startDate: '', dateUnconfirmed: 'on' }))
    expect(unconfirmed.ok).toBe(true)
    if (unconfirmed.ok) expect(unconfirmed.lead.eventDate).toBeNull()
  })

  it('asks what the client wants when the job type is Other', () => {
    const r = parseNewLead(form({ ...base, jobType: 'Other' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.jobTypeNote).toBeDefined()

    const ok = parseNewLead(form({ ...base, jobType: 'Other', jobTypeNote: 'Drone footage only' }))
    expect(ok.ok && ok.lead.coverageNote).toBe('Drone footage only')
  })

  it('only takes a source from the website list', () => {
    expect(parseNewLead(form({ ...base, source: 'Instagram' })).ok).toBe(true)
    const r = parseNewLead(form({ ...base, source: 'Billboard' }))
    expect(!r.ok && r.errors.source).toBeTruthy()
  })

  it('checks the date and time order', () => {
    const endBefore = parseNewLead(form({ ...base, endDate: '2027-03-13' }))
    expect(!endBefore.ok && endBefore.errors.endDate).toBeTruthy()

    const timeBefore = parseNewLead(form({ ...base, startTime: '18:00', endTime: '09:00' }))
    expect(!timeBefore.ok && timeBefore.errors.endTime).toBeTruthy()

    // Across two days an earlier end time is fine (an evening that runs past midnight).
    const overnight = parseNewLead(form({ ...base, endDate: '2027-03-15', startTime: '18:00', endTime: '01:00' }))
    expect(overnight.ok).toBe(true)

    const endOnly = parseNewLead(form({ ...base, endTime: '17:00' }))
    expect(!endOnly.ok && endOnly.errors.startTime).toBeTruthy()

    expect(parseNewLead(form({ ...base, startDate: '2027-02-30' })).ok).toBe(false)
  })

  it('drops times for an all-day shoot and a same-day end date', () => {
    const r = parseNewLead(form({ ...base, endDate: '2027-03-14', allDay: 'on', startTime: '10:00' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lead.eventEndDate).toBeNull()
    expect(r.lead.eventStartTime).toBeNull()
  })
})

describe('formatShootWindow / jobTypeLabel', () => {
  const day = new Date('2027-03-14T00:00:00.000Z')
  it('formats the main shoot on one line', () => {
    expect(formatShootWindow({ eventDate: null })).toBeNull()
    expect(formatShootWindow({ eventDate: day })).toBe('14 Mar 2027 · All day')
    expect(formatShootWindow({ eventDate: day, eventStartTime: '14:00', eventEndTime: '22:30' })).toBe('14 Mar 2027 · 2:00 pm to 10:30 pm')
    expect(formatShootWindow({ eventDate: day, eventEndDate: new Date('2027-03-15T00:00:00.000Z'), eventStartTime: '09:00' })).toBe(
      '14 Mar 2027 to 15 Mar 2027 · from 9:00 am',
    )
  })

  it('labels the job type', () => {
    expect(jobTypeLabel('Both')).toBe('Both (Photography & Videography)')
    expect(jobTypeLabel('Other', 'Drone only')).toBe('Other: Drone only')
    expect(jobTypeLabel(null)).toBeNull()
  })
})
