'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { createCalendarEvent, moveCalendarItem } from '@/lib/domain/calendar'
import { toggleEnquiryTask } from '@/lib/domain/enquiry-workflow'
import { toggleProjectTask } from '@/lib/domain/project-workflow'
import { prisma } from '@/lib/db'

export type CalendarActionState = { status: 'idle' | 'success' | 'error'; message?: string }

const createSchema = z
  .object({
    title: z.string().trim().min(1, 'Add a title.').max(200, 'Title is too long.'),
    kind: z.enum(['APPOINTMENT', 'SHOOT', 'OTHER']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
    allDay: z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    clientId: z.string().trim().optional().or(z.literal('')),
    location: z.string().trim().max(255).optional().or(z.literal('')),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (!val.allDay && !val.startTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Add a start time or mark it all day.' })
    if (!val.allDay && val.startTime && val.endTime && val.endTime < val.startTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time is before the start time.' })
  })

export async function createCalendarEventAction(_prev: CalendarActionState, formData: FormData): Promise<CalendarActionState> {
  const user = await getSessionUser()
  if (!user || !can(user, 'CALENDAR_MANAGE')) return { status: 'error', message: 'Not authorised.' }
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return { status: 'error', message: 'Invalid request.' }

  const parsed = createSchema.safeParse({
    title: formData.get('title') ?? '', kind: formData.get('kind') ?? 'APPOINTMENT', date: formData.get('date') ?? '',
    allDay: formData.get('allDay') === 'on', startTime: formData.get('startTime') ?? '', endTime: formData.get('endTime') ?? '',
    clientId: formData.get('clientId') ?? '', location: formData.get('location') ?? '', notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' }

  const v = parsed.data
  await createCalendarEvent({
    title: v.title, kind: v.kind, date: v.date, allDay: v.allDay,
    startTime: v.startTime || null, endTime: v.endTime || null,
    clientId: v.clientId || null, location: v.location || null, notes: v.notes || null, createdByUserId: user.id,
  })
  revalidatePath('/calendar')
  return { status: 'success' }
}

const moveSchema = z.object({
  kind: z.enum(['booking', 'event']),
  refId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.coerce.number().int().min(0).max(1439).nullable(),
})

/** Drag-to-reschedule: move a booking or standalone event to a new day/time. */
export async function moveCalendarItemAction(formData: FormData): Promise<CalendarActionState> {
  const user = await getSessionUser()
  if (!user || !can(user, 'CALENDAR_MANAGE')) return { status: 'error', message: 'Not authorised.' }
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return { status: 'error', message: 'Invalid request.' }

  const raw = formData.get('startMin')
  const parsed = moveSchema.safeParse({
    kind: formData.get('kind'), refId: formData.get('refId'), date: formData.get('date'),
    startMin: raw === '' || raw === null ? null : raw,
  })
  if (!parsed.success) return { status: 'error', message: 'Could not move the event.' }
  await moveCalendarItem(parsed.data.kind, parsed.data.refId, parsed.data.date, parsed.data.startMin)
  revalidatePath('/calendar')
  return { status: 'success' }
}

/** Mark a to-do complete straight from the calendar's Agenda view; routes to the right toggle. */
export async function markTaskDoneAction(formData: FormData): Promise<void> {
  const user = await getSessionUser()
  if (!user) throw new Error('Not authorised.')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) throw new Error('Invalid request.')

  const taskId = String(formData.get('taskId') ?? '')
  if (!taskId) return
  const wi = await prisma.workItem.findUnique({ where: { id: taskId }, select: { enquiryId: true, projectId: true } })
  if (!wi) return
  if (wi.enquiryId) {
    if (!can(user, 'ENQUIRY_CONVERT')) throw new Error('Not authorised.')
    await toggleEnquiryTask(taskId, user.id)
  } else if (wi.projectId) {
    if (!can(user, 'PROJECT_EDIT')) throw new Error('Not authorised.')
    await toggleProjectTask(taskId, user.id)
  }
  revalidatePath('/calendar')
}

export type SearchHit = { type: 'Client' | 'Job' | 'Enquiry'; label: string; sub: string | null; href: string }

/** Command palette (Cmd/Ctrl-K) - search clients, jobs and enquiries by name. */
export async function searchEntitiesAction(query: string): Promise<SearchHit[]> {
  const user = await getSessionUser()
  if (!user) return []
  const q = query.trim()
  if (q.length < 2) return []
  const contains = { contains: q, mode: 'insensitive' as const }

  const [clients, projects, enquiries] = await Promise.all([
    can(user, 'CLIENT_VIEW')
      ? prisma.client.findMany({ where: { archivedAt: null, OR: [{ displayName: contains }, { email: contains }] }, take: 5, select: { id: true, displayName: true, email: true } })
      : Promise.resolve([]),
    can(user, 'PROJECT_VIEW')
      ? prisma.project.findMany({ where: { OR: [{ name: contains }, { code: contains }, { client: { displayName: contains } }] }, take: 5, select: { id: true, name: true, code: true, client: { select: { displayName: true } } } })
      : Promise.resolve([]),
    can(user, 'ENQUIRY_VIEW')
      ? prisma.enquiry.findMany({ where: { OR: [{ name: contains }, { email: contains }] }, take: 5, select: { id: true, name: true, eventType: true } })
      : Promise.resolve([]),
  ])

  return [
    ...clients.map((c): SearchHit => ({ type: 'Client', label: c.displayName, sub: c.email, href: `/clients/${c.id}` })),
    ...projects.map((p): SearchHit => ({ type: 'Job', label: p.client.displayName, sub: `${p.name} - ${p.code}`, href: `/jobs/${p.id}` })),
    ...enquiries.map((e): SearchHit => ({ type: 'Enquiry', label: e.name, sub: e.eventType, href: `/enquiries/${e.id}` })),
  ]
}
