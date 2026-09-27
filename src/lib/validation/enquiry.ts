import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))

export const enquirySchema = z.object({
  name: z.string({ invalid_type_error: "Please enter the client's name." }).trim().min(1, "Please enter the client's name.").max(120, 'That name is too long.'),
  firstName: optionalText(80),
  lastName: optionalText(80),
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
  eventType: optionalText(80),
  message: optionalText(2000),
  source: optionalText(60),
})
  // A person's name is one person: no "&" in first/last name (write "and", or add each person
  // separately). The single `name` field stays flexible for the public form.
  .refine((d) => !d.firstName?.includes('&'), { message: "Please write 'and' instead of '&' in a name.", path: ['firstName'] })
  .refine((d) => !d.lastName?.includes('&'), { message: "Please write 'and' instead of '&' in a name.", path: ['lastName'] })

export type EnquiryInput = z.infer<typeof enquirySchema>
