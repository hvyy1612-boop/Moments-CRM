import { z } from 'zod'

/** Staff client intake (SEC-A02: validated server-side regardless of the browser). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))

export const clientSchema = z.object({
  firstName: optionalText(80),
  lastName: optionalText(80),
  company: optionalText(150),
  email: z.string().trim().min(1, 'Enter an email.').max(254).email('Enter a valid email.'),
  phone: optionalText(40),
  street: optionalText(200),
  suburb: optionalText(100),
  state: optionalText(100),
  postcode: optionalText(20),
  country: optionalText(100),
  isCompany: z.boolean().optional(),
  notes: optionalText(2000),
})

export type ClientInput = z.infer<typeof clientSchema>
