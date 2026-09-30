import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password'

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(150),
  email: z.string().trim().min(1, 'Please enter an email address.').max(254).email('Please enter a valid email address.'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(200),
})

export type RegisterInput = z.infer<typeof registerSchema>
