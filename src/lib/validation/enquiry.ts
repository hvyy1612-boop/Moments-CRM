import { z } from 'zod'

/** Enquiry intake. Server-side validation (SEC-A02), whatever the browser already checked. `name`
 * stays the single display name so the public form and existing flows keep working; the richer staff
 * intake sends first and last name as well and builds `name` from them. */
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

export type EnquiryInput = z.infer<typeof enquirySchema>
