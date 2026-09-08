import { z } from 'zod'

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
  email: z
    .string({ invalid_type_error: 'Please enter an email address.' })
    .trim()
    .min(1, 'Please enter an email address.')
    .max(254, 'That email is too long.')
    .email('Please enter a valid email address.'),
  phone: optionalText(40),
  street: optionalText(200),
  suburb: optionalText(100),
  state: optionalText(100),
  postcode: optionalText(20),
  country: optionalText(100),
  isCompany: z.boolean().optional(),
  notes: optionalText(2000),
})
  // A client must be identifiable: at least a first/last name, or a company name for a business.
  .refine((d) => Boolean(d.firstName || d.lastName || d.company), {
    message: "Please enter the client's name.",
    path: ['firstName'],
  })

export type ClientInput = z.infer<typeof clientSchema>
