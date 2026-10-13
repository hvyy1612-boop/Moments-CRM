import { z } from 'zod'

/** Server-side validation for every auth input (SEC-A02), whatever the client already checked. */

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Please enter your email.').max(254).email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.').max(200),
  remember: z.literal('on').optional(),
})

