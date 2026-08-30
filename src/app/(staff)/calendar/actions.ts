'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { createCalendarEvent } from '@/lib/domain/calendar'

export type CalendarActionState = { status: 'idle' | 'success' | 'error'; message?: string }

const schema = z
  .object({
    title: z.string().trim().min(1, 'Add a title.').max(200, 'Title is too long.'),
    kind: z.enum(['APPOINTMENT', 'SHOOT', 'OTHER']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
    allDay: z.boolean(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal('')),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal('')),
    clientId: z.string().trim().optional().or(z.literal('')),
    location: z.string().trim().max(255).optional().or(z.literal('')),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (!val.allDay && !val.startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Add a start time or mark it all day.' })
    }
    if (!val.allDay && val.startTime && val.endTime && val.endTime < val.startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time is before the start time.' })
    }
  })

export async function createCalendarEventAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const user = await getSessionUser()
  if (!user || !can(user, 'CALENDAR_MANAGE')) return { status: 'error', message: 'Not authorised.' }

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return { status: 'error', message: 'Invalid request.' }

  const parsed = schema.safeParse({
    title: formData.get('title') ?? '',
    kind: formData.get('kind') ?? 'APPOINTMENT',
    date: formData.get('date') ?? '',
    allDay: formData.get('allDay') === 'on',
    startTime: formData.get('startTime') ?? '',
    endTime: formData.get('endTime') ?? '',
    clientId: formData.get('clientId') ?? '',
    location: formData.get('location') ?? '',
    notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' }
  }

  const v = parsed.data
  await createCalendarEvent({
    title: v.title,
    kind: v.kind,
    date: v.date,
    allDay: v.allDay,
    startTime: v.startTime || null,
    endTime: v.endTime || null,
    clientId: v.clientId || null,
    location: v.location || null,
    notes: v.notes || null,
    createdByUserId: user.id,
  })

  revalidatePath('/calendar')
  return { status: 'success' }
}
