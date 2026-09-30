import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))

export const createBookingSchema = z
  .object({
    title: optionalText(200),
    startsAt: z.string().trim().min(1, 'Please choose a start time.'),
    endsAt: z.string().trim().min(1, 'Please choose an end time.'),
    location: optionalText(300),
    notes: optionalText(2000),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: 'The end time must be after the start time.',
    path: ['endsAt'],
  })

export const assignResourceSchema = z.object({
  resourceId: z.string().trim().min(1, 'Please choose someone to assign.'),
  role: optionalText(120),
})

export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type AssignResourceInput = z.infer<typeof assignResourceSchema>
