import { z } from 'zod'

export const signContractSchema = z.object({
  signedName: z.string().trim().min(1, 'Please type your full name to sign.').max(120),
})
