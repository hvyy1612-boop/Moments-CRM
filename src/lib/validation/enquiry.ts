import { z } from 'zod'

/** Public enquiry form. Server-side validation (SEC-A02), whatever the browser already checked. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))

export const enquirySchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  email: z.string().trim().min(1, 'Enter your email.').max(254).email('Enter a valid email.'),
  phone: optionalText(40),
  eventType: optionalText(80),
  message: optionalText(2000),
  source: optionalText(60),
})

export type EnquiryInput = z.infer<typeof enquirySchema>
