import { z } from 'zod'

/** Enquiry intake. Server-side validation (SEC-A02), whatever the browser already checked. `name`
 * stays the single display name so the public form and existing flows keep working; the richer staff
 * intake sends first and last name as well and builds `name` from them. */
// The limit matches the database column, with a human message (never a raw "at most N character(s)").
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
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
  phone: optionalText(30), // enquiries.phone is VARCHAR(30)
  street: optionalText(200),
  suburb: optionalText(100),
  state: optionalText(100),
  postcode: optionalText(20),
  country: optionalText(100),
  isCompany: z.boolean().optional(),
  eventType: optionalText(50), // enquiries.event_type is VARCHAR(50)
  message: optionalText(2000),
  source: optionalText(60),
})
  // A person's name is one person: no "&" in first/last name (write "and", or add each person
  // separately). The single `name` field stays flexible for the public form.
  .refine((d) => !d.firstName?.includes('&'), { message: "Please write 'and' instead of '&' in a name.", path: ['firstName'] })
  .refine((d) => !d.lastName?.includes('&'), { message: "Please write 'and' instead of '&' in a name.", path: ['lastName'] })

export type EnquiryInput = z.infer<typeof enquirySchema>
