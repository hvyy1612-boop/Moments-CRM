import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))

/** Staff schedule a shoot. Start/end are datetime-local strings (Sydney wall time), converted in the domain. */
export const createBookingSchema = z
  .object({
    title: optionalText(200),
    startsAt: z.string().trim().min(1, 'Choose a start time.'),
    endsAt: z.string().trim().min(1, 'Choose an end time.'),
    location: optionalText(300),
    notes: optionalText(2000),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: 'The end time must be after the start time.',
    path: ['endsAt'],
  })

export const assignResourceSchema = z.object({
  resourceId: z.string().trim().min(1, 'Choose someone to assign.'),
  role: optionalText(120),
})

export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type AssignResourceInput = z.infer<typeof assignResourceSchema>
