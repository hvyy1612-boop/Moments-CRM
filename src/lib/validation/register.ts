import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password'

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(150),
  email: z.string().trim().min(1, 'Enter an email.').max(254).email('Enter a valid email.'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(200),
})

export type RegisterInput = z.infer<typeof registerSchema>
