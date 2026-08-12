import { z } from 'zod'

/** Server-side validation for every auth input (SEC-A02), whatever the client already checked. */

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').max(254).email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.').max(200),
  remember: z.literal('on').optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').max(254).email('Enter a valid email.'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(1, 'Enter a new password.').max(200),
    confirmPassword: z.string().min(1, 'Repeat the new password.').max(200),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match.',
  })
