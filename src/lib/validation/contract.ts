import { z } from 'zod'

export const signContractSchema = z.object({
  signedName: z.string().trim().min(1, 'Type your full name to sign.').max(120),
})

export type SignContractInput = z.infer<typeof signContractSchema>
