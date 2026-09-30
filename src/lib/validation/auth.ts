import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Please enter your email.').max(254).email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.').max(200),
  remember: z.literal('on').optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Please enter your email.').max(254).email('Please enter a valid email address.'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(1, 'Please enter a new password.').max(200),
    confirmPassword: z.string().min(1, 'Please repeat the new password.').max(200),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match.',
  })
